import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  FileText, 
  Printer, 
  Download, 
  Save,
  User,
  Calendar,
  Building2,
  Stethoscope,
  Pill,
  Plus,
  Trash2,
  Search,
  Check,
  ChevronsUpDown,
  Eye,
  Clock,
  AlertCircle,
  RefreshCw,
  Languages,
  Activity
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getTranslation, 
  languageOptions, 
  translateFrequency, 
  translateDuration,
  getFontForLanguage,
  type PrescriptionTranslation 
} from "@/utils/prescriptionTranslations";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  route: string;
}

interface PatientInfo {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  bloodGroup: string;
  allergies: string[];
  address: string;
}

interface PrescriptionData {
  patientInfo: PatientInfo;
  chiefComplaint: string;
  diagnosis: string;
  medications: Medication[];
  investigations: string;
  advice: string;
  followUp: string;
  vitals: {
    bp: string;
    pulse: string;
    temp: string;
    spo2: string;
    weight: string;
    height: string;
  };
}

// Common medication frequencies
const frequencies = [
  "Once daily (OD)",
  "Twice daily (BD)",
  "Three times daily (TDS)",
  "Four times daily (QID)",
  "Every 4 hours (Q4H)",
  "Every 6 hours (Q6H)",
  "Every 8 hours (Q8H)",
  "Every 12 hours (Q12H)",
  "At bedtime (HS)",
  "Before meals (AC)",
  "After meals (PC)",
  "As needed (SOS/PRN)",
  "Once weekly",
  "Stat (immediately)"
];

// Common medication routes
const routes = [
  "Oral (PO)",
  "Sublingual (SL)",
  "Intravenous (IV)",
  "Intramuscular (IM)",
  "Subcutaneous (SC)",
  "Topical",
  "Inhalation",
  "Rectal (PR)",
  "Ophthalmic (eye)",
  "Otic (ear)",
  "Nasal",
  "Transdermal"
];

// Common durations
const durations = [
  "1 day",
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "21 days",
  "1 month",
  "2 months",
  "3 months",
  "6 months",
  "Continuous",
  "As directed"
];

const PrescriptionWriter = () => {
  const { currentDoctor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  
  const patientIdFromUrl = searchParams.get('patientId');
  const appointmentIdFromUrl = searchParams.get('appointmentId');

  const [selectedPatient, setSelectedPatient] = useState<PatientInfo | null>(null);
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  
  // Multi-language support
  const [prescriptionLanguage, setPrescriptionLanguage] = useState("en");
  const t = getTranslation(prescriptionLanguage);

  const [prescription, setPrescription] = useState<PrescriptionData>({
    patientInfo: {
      id: "",
      name: "",
      age: 0,
      gender: "",
      phone: "",
      email: "",
      bloodGroup: "",
      allergies: [],
      address: ""
    },
    chiefComplaint: "",
    diagnosis: "",
    medications: [],
    investigations: "",
    advice: "",
    followUp: "",
    vitals: {
      bp: "",
      pulse: "",
      temp: "",
      spo2: "",
      weight: "",
      height: ""
    }
  });

  // Fetch template settings for header/footer
  const { data: templateSettings } = useQuery({
    queryKey: ['doctor-template-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/template-settings');
        return response.data.settings;
      } catch (err) {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch doctor's patients for search
  const { data: patientsData } = useQuery({
    queryKey: ['doctor-patients-search', patientSearchQuery],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/patients', {
          params: { search: patientSearchQuery, limit: 10 }
        });
        return response.data.patients || [];
      } catch (err) {
        return [];
      }
    },
    enabled: patientSearchQuery.length > 0,
  });

  // Fetch specific patient if ID provided
  const { data: patientFromUrl } = useQuery({
    queryKey: ['patient-detail', patientIdFromUrl],
    queryFn: async () => {
      if (!patientIdFromUrl) return null;
      try {
        const response = await api.get(`/users/${patientIdFromUrl}`);
        return response.data.user;
      } catch (err) {
        return null;
      }
    },
    enabled: !!patientIdFromUrl,
  });

  // Fetch appointment details if provided
  const { data: appointmentData } = useQuery({
    queryKey: ['appointment-detail', appointmentIdFromUrl],
    queryFn: async () => {
      if (!appointmentIdFromUrl) return null;
      try {
        const response = await api.get(`/appointments/${appointmentIdFromUrl}`);
        return response.data.appointment;
      } catch (err) {
        return null;
      }
    },
    enabled: !!appointmentIdFromUrl,
  });

  // Auto-fill patient from URL or appointment
  useEffect(() => {
    if (patientFromUrl) {
      const patient: PatientInfo = {
        id: patientFromUrl.id,
        name: `${patientFromUrl.firstName || ''} ${patientFromUrl.lastName || ''}`.trim(),
        age: calculateAge(patientFromUrl.dateOfBirth),
        gender: patientFromUrl.gender || '',
        phone: patientFromUrl.phoneNumber || '',
        email: patientFromUrl.email || '',
        bloodGroup: patientFromUrl.bloodGroup || '',
        allergies: patientFromUrl.allergies || [],
        address: formatAddress(patientFromUrl.address)
      };
      setSelectedPatient(patient);
      setPrescription(prev => ({ ...prev, patientInfo: patient }));
    }
  }, [patientFromUrl]);

  useEffect(() => {
    if (appointmentData?.patient) {
      const patient = appointmentData.patient;
      const patientInfo: PatientInfo = {
        id: patient.id,
        name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
        age: calculateAge(patient.dateOfBirth),
        gender: patient.gender || '',
        phone: patient.phoneNumber || '',
        email: patient.email || '',
        bloodGroup: patient.bloodGroup || '',
        allergies: patient.allergies || [],
        address: formatAddress(patient.address)
      };
      setSelectedPatient(patientInfo);
      setPrescription(prev => ({ 
        ...prev, 
        patientInfo: patientInfo,
        chiefComplaint: appointmentData.reason || ''
      }));
    }
  }, [appointmentData]);

  const calculateAge = (dateOfBirth: string | null): number => {
    if (!dateOfBirth) return 0;
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const formatAddress = (address: any): string => {
    if (!address) return '';
    if (typeof address === 'string') return address;
    const parts = [address.street, address.city, address.state, address.pincode].filter(Boolean);
    return parts.join(', ');
  };

  const handleSelectPatient = (patient: any) => {
    const patientInfo: PatientInfo = {
      id: patient.id,
      name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      age: calculateAge(patient.dateOfBirth),
      gender: patient.gender || '',
      phone: patient.phoneNumber || '',
      email: patient.email || '',
      bloodGroup: patient.bloodGroup || '',
      allergies: patient.allergies || [],
      address: formatAddress(patient.address)
    };
    setSelectedPatient(patientInfo);
    setPrescription(prev => ({ ...prev, patientInfo: patientInfo }));
    setPatientSearchOpen(false);
  };

  const addMedication = () => {
    const newMed: Medication = {
      id: `med_${Date.now()}`,
      name: "",
      dosage: "",
      frequency: "Twice daily (BD)",
      duration: "5 days",
      instructions: "",
      route: "Oral (PO)"
    };
    setPrescription(prev => ({
      ...prev,
      medications: [...prev.medications, newMed]
    }));
  };

  const updateMedication = (id: string, field: keyof Medication, value: string) => {
    setPrescription(prev => ({
      ...prev,
      medications: prev.medications.map(med =>
        med.id === id ? { ...med, [field]: value } : med
      )
    }));
  };

  const removeMedication = (id: string) => {
    setPrescription(prev => ({
      ...prev,
      medications: prev.medications.filter(med => med.id !== id)
    }));
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Get appropriate font for selected language
    const fontFamily = getFontForLanguage(prescriptionLanguage);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${t.prescription} - ${prescription.patientInfo.name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil&family=Noto+Sans+Devanagari&family=Noto+Sans+Telugu&family=Noto+Sans+Kannada&family=Noto+Sans+Malayalam&family=Noto+Sans+Bengali&family=Noto+Sans+Gujarati&family=Noto+Sans+Gurmukhi&family=Noto+Sans+Oriya&display=swap" rel="stylesheet">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: ${fontFamily}; font-size: 12pt; line-height: 1.4; }
            .prescription { max-width: 210mm; margin: 0 auto; padding: 15mm; }
            .header { border-bottom: 2px solid #1a56db; padding-bottom: 10px; margin-bottom: 15px; }
            .header-content { display: flex; align-items: flex-start; gap: 15px; }
            .logo { max-width: 80px; max-height: 80px; object-fit: contain; }
            .clinic-info { flex: 1; }
            .clinic-name { font-size: 18pt; font-weight: bold; color: #1a56db; }
            .clinic-details { font-size: 10pt; color: #666; }
            .doctor-info { text-align: right; font-size: 10pt; }
            .doctor-name { font-weight: bold; font-size: 12pt; }
            .patient-section { background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px; }
            .patient-row { display: flex; gap: 20px; margin-bottom: 5px; flex-wrap: wrap; }
            .patient-field { }
            .patient-label { font-weight: bold; font-size: 10pt; color: #666; }
            .patient-value { font-size: 11pt; }
            .section { margin-bottom: 12px; }
            .section-title { font-weight: bold; font-size: 11pt; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 5px; }
            .rx-symbol { font-size: 24pt; font-weight: bold; color: #1a56db; margin-right: 10px; }
            .medication-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .medication-table th, .medication-table td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
            .medication-table th { background: #f0f0f0; font-size: 10pt; }
            .medication-name { font-weight: bold; }
            .medication-details { font-size: 10pt; color: #666; }
            .footer { margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
            .stamp-area { text-align: center; }
            .seal { max-width: 80px; max-height: 80px; opacity: 0.8; }
            .signature-area { text-align: right; }
            .signature { max-width: 120px; max-height: 50px; }
            .signature-name { font-weight: bold; margin-top: 5px; }
            .signature-details { font-size: 9pt; color: #666; }
            .footer-text { text-align: center; font-size: 8pt; color: #999; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; }
            .vitals-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .vital-item { background: #f0f7ff; padding: 5px 10px; border-radius: 3px; }
            .vital-label { font-size: 9pt; color: #666; }
            .vital-value { font-weight: bold; }
            .allergy-warning { background: #fff3cd; color: #856404; padding: 5px 10px; border-radius: 3px; margin-bottom: 10px; font-size: 10pt; }
            .disclaimer-text { font-size: 9pt; color: #666; margin-top: 15px; padding: 10px; background: #f9fafb; border-radius: 5px; text-align: center; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .prescription { padding: 10mm; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Save prescription
  const savePrescriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/prescriptions', {
        patientId: prescription.patientInfo.id,
        appointmentId: appointmentIdFromUrl,
        ...prescription,
        doctorId: currentDoctor?.id,
        language: prescriptionLanguage
      });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Prescription saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save prescription", variant: "destructive" });
    }
  });

  // Generate doctor stamp
  const doctorStamp = {
    name: `Dr. ${currentDoctor?.firstName || ''} ${currentDoctor?.lastName || ''}`.trim(),
    qualifications: currentDoctor?.qualifications?.join(', ') || 'MBBS',
    specialization: currentDoctor?.specialization || 'General Practitioner',
    registrationNo: currentDoctor?.registrationNumber || templateSettings?.registrationNumber || ''
  };

  // Clinic/Hospital info from template settings or doctor profile
  const clinicInfo = {
    name: templateSettings?.clinicName || currentDoctor?.clinicName || 'Medical Clinic',
    address: templateSettings?.clinicAddress || '',
    phone: templateSettings?.clinicPhone || currentDoctor?.phoneNumber || '',
    email: templateSettings?.clinicEmail || currentDoctor?.email || '',
    website: templateSettings?.clinicWebsite || ''
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Write Prescription</h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">Create a prescription with auto-filled patient and doctor information</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {/* Language Selector */}
              <Select value={prescriptionLanguage} onValueChange={setPrescriptionLanguage}>
                <SelectTrigger className="w-[180px]">
                  <Languages className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.nativeName} ({lang.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button onClick={() => savePrescriptionMutation.mutate()} disabled={savePrescriptionMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Patient Selection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Patient Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Patient Search */}
                  <div className="flex gap-2">
                    <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {selectedPatient ? selectedPatient.name : "Search patient..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0">
                        <Command>
                          <CommandInput 
                            placeholder="Search by name or phone..." 
                            value={patientSearchQuery}
                            onValueChange={setPatientSearchQuery}
                          />
                          <CommandList>
                            <CommandEmpty>No patient found.</CommandEmpty>
                            <CommandGroup>
                              {patientsData?.map((patient: any) => (
                                <CommandItem
                                  key={patient.id}
                                  onSelect={() => handleSelectPatient(patient)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedPatient?.id === patient.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div>
                                    <div className="font-medium">
                                      {patient.firstName} {patient.lastName}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {patient.phoneNumber} • {patient.gender}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Patient Details - Auto-filled */}
                  {selectedPatient && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                      <div>
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <p className="font-medium">{selectedPatient.name}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Age / Gender</Label>
                        <p className="font-medium">{selectedPatient.age} yrs / {selectedPatient.gender}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Phone</Label>
                        <p className="font-medium">{selectedPatient.phone || '-'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Blood Group</Label>
                        <p className="font-medium">{selectedPatient.bloodGroup || '-'}</p>
                      </div>
                      {selectedPatient.allergies?.length > 0 && (
                        <div className="col-span-4">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-destructive" />
                            Allergies
                          </Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedPatient.allergies.map((allergy, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">{allergy}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Vitals */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Vital Signs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Blood Pressure (mmHg)</Label>
                      <Input 
                        placeholder="120/80"
                        value={prescription.vitals.bp}
                        onChange={(e) => setPrescription(prev => ({
                          ...prev,
                          vitals: { ...prev.vitals, bp: e.target.value }
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Pulse Rate (bpm)</Label>
                      <Input 
                        placeholder="72"
                        value={prescription.vitals.pulse}
                        onChange={(e) => setPrescription(prev => ({
                          ...prev,
                          vitals: { ...prev.vitals, pulse: e.target.value }
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Temperature (°F)</Label>
                      <Input 
                        placeholder="98.6"
                        value={prescription.vitals.temp}
                        onChange={(e) => setPrescription(prev => ({
                          ...prev,
                          vitals: { ...prev.vitals, temp: e.target.value }
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">SpO2 (%)</Label>
                      <Input 
                        placeholder="98"
                        value={prescription.vitals.spo2}
                        onChange={(e) => setPrescription(prev => ({
                          ...prev,
                          vitals: { ...prev.vitals, spo2: e.target.value }
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Weight (kg)</Label>
                      <Input 
                        placeholder="70"
                        value={prescription.vitals.weight}
                        onChange={(e) => setPrescription(prev => ({
                          ...prev,
                          vitals: { ...prev.vitals, weight: e.target.value }
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Height (cm)</Label>
                      <Input 
                        placeholder="170"
                        value={prescription.vitals.height}
                        onChange={(e) => setPrescription(prev => ({
                          ...prev,
                          vitals: { ...prev.vitals, height: e.target.value }
                        }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Clinical Notes */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Clinical Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Chief Complaint</Label>
                    <Textarea 
                      placeholder="Patient complains of..."
                      value={prescription.chiefComplaint}
                      onChange={(e) => setPrescription(prev => ({ ...prev, chiefComplaint: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Diagnosis</Label>
                    <Textarea 
                      placeholder="Clinical diagnosis..."
                      value={prescription.diagnosis}
                      onChange={(e) => setPrescription(prev => ({ ...prev, diagnosis: e.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Medications */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5" />
                      Medications
                    </CardTitle>
                    <Button size="sm" onClick={addMedication}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Medicine
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {prescription.medications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Pill className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No medications added yet</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={addMedication}>
                        Add First Medicine
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {prescription.medications.map((med, index) => (
                        <div key={med.id} className="p-4 border rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive"
                              onClick={() => removeMedication(med.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="md:col-span-2 space-y-1">
                              <Label className="text-xs">Medicine Name</Label>
                              <Input 
                                placeholder="e.g., Paracetamol 500mg"
                                value={med.name}
                                onChange={(e) => updateMedication(med.id, 'name', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Dosage</Label>
                              <Input 
                                placeholder="e.g., 1 tablet"
                                value={med.dosage}
                                onChange={(e) => updateMedication(med.id, 'dosage', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Route</Label>
                              <Select 
                                value={med.route} 
                                onValueChange={(v) => updateMedication(med.id, 'route', v)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {routes.map(route => (
                                    <SelectItem key={route} value={route}>{route}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Frequency</Label>
                              <Select 
                                value={med.frequency} 
                                onValueChange={(v) => updateMedication(med.id, 'frequency', v)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {frequencies.map(freq => (
                                    <SelectItem key={freq} value={freq}>{freq}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Duration</Label>
                              <Select 
                                value={med.duration} 
                                onValueChange={(v) => updateMedication(med.id, 'duration', v)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {durations.map(dur => (
                                    <SelectItem key={dur} value={dur}>{dur}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="md:col-span-2 space-y-1">
                              <Label className="text-xs">Special Instructions</Label>
                              <Input 
                                placeholder="e.g., Take with food, avoid alcohol"
                                value={med.instructions}
                                onChange={(e) => updateMedication(med.id, 'instructions', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Investigations & Advice */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Investigations & Advice</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Investigations Advised</Label>
                    <Textarea 
                      placeholder="Lab tests, imaging studies..."
                      value={prescription.investigations}
                      onChange={(e) => setPrescription(prev => ({ ...prev, investigations: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>General Advice</Label>
                    <Textarea 
                      placeholder="Dietary instructions, lifestyle modifications..."
                      value={prescription.advice}
                      onChange={(e) => setPrescription(prev => ({ ...prev, advice: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Follow-up</Label>
                    <Input 
                      placeholder="e.g., After 1 week, or SOS if symptoms worsen"
                      value={prescription.followUp}
                      onChange={(e) => setPrescription(prev => ({ ...prev, followUp: e.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Doctor & Clinic Info */}
            <div className="space-y-6">
              {/* Doctor Info Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5" />
                    Doctor Information
                  </CardTitle>
                  <CardDescription>Auto-filled from your profile</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg space-y-2">
                    <p className="font-bold text-lg text-slate-800 dark:text-white">{doctorStamp.name}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{doctorStamp.qualifications}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{doctorStamp.specialization}</p>
                    {doctorStamp.registrationNo && (
                      <p className="text-xs text-muted-foreground">Reg. No: {doctorStamp.registrationNo}</p>
                    )}
                  </div>
                  
                  {/* Signature Preview */}
                  {templateSettings?.signature && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Signature</Label>
                      <div className="border rounded-lg p-2 bg-white">
                        <img 
                          src={templateSettings.signature} 
                          alt="Signature" 
                          className="max-h-16 object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Seal Preview */}
                  {templateSettings?.seal && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Seal/Stamp</Label>
                      <div className="border rounded-lg p-2 bg-white">
                        <img 
                          src={templateSettings.seal} 
                          alt="Seal" 
                          className="max-h-16 object-contain"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Clinic Info Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Clinic/Hospital
                  </CardTitle>
                  <CardDescription>From template settings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg space-y-2">
                    {templateSettings?.logo && (
                      <img 
                        src={templateSettings.logo} 
                        alt="Logo" 
                        className="max-h-12 object-contain mb-2"
                      />
                    )}
                    <p className="font-bold text-slate-800 dark:text-white">{clinicInfo.name}</p>
                    {clinicInfo.address && <p className="text-sm text-slate-600 dark:text-slate-400">{clinicInfo.address}</p>}
                    {clinicInfo.phone && <p className="text-sm text-slate-700 dark:text-slate-300">📞 {clinicInfo.phone}</p>}
                    {clinicInfo.email && <p className="text-sm text-slate-700 dark:text-slate-300">✉️ {clinicInfo.email}</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" onClick={() => setPreviewOpen(true)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Prescription
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Prescription
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Hidden Print Content */}
          <div className="hidden">
            <div ref={printRef} className="prescription">
              {/* Header */}
              <div className="header">
                <div className="header-content">
                  {templateSettings?.logo && (
                    <img src={templateSettings.logo} alt="Logo" className="logo" />
                  )}
                  <div className="clinic-info">
                    <div className="clinic-name" style={{ color: templateSettings?.headerColor || '#1a56db' }}>
                      {clinicInfo.name}
                    </div>
                    {clinicInfo.address && <div className="clinic-details">{clinicInfo.address}</div>}
                    <div className="clinic-details">
                      {clinicInfo.phone && `${t.phone}: ${clinicInfo.phone}`}
                      {clinicInfo.email && ` | Email: ${clinicInfo.email}`}
                    </div>
                  </div>
                  <div className="doctor-info">
                    <div className="doctor-name">{doctorStamp.name}</div>
                    <div>{doctorStamp.qualifications}</div>
                    <div>{doctorStamp.specialization}</div>
                    {doctorStamp.registrationNo && <div>{t.registrationNo}: {doctorStamp.registrationNo}</div>}
                  </div>
                </div>
              </div>

              {/* Patient Section */}
              <div className="patient-section">
                <div className="patient-row">
                  <div className="patient-field">
                    <span className="patient-label">{t.patient}: </span>
                    <span className="patient-value">{prescription.patientInfo.name}</span>
                  </div>
                  <div className="patient-field">
                    <span className="patient-label">{t.ageGender}: </span>
                    <span className="patient-value">{prescription.patientInfo.age} {t.yrs} / {prescription.patientInfo.gender}</span>
                  </div>
                  <div className="patient-field">
                    <span className="patient-label">{t.date}: </span>
                    <span className="patient-value">{new Date().toLocaleDateString('en-IN')}</span>
                  </div>
                </div>
                {prescription.patientInfo.phone && (
                  <div className="patient-row">
                    <div className="patient-field">
                      <span className="patient-label">{t.phone}: </span>
                      <span className="patient-value">{prescription.patientInfo.phone}</span>
                    </div>
                    {prescription.patientInfo.bloodGroup && (
                      <div className="patient-field">
                        <span className="patient-label">{t.bloodGroup}: </span>
                        <span className="patient-value">{prescription.patientInfo.bloodGroup}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Allergies Warning */}
              {prescription.patientInfo.allergies?.length > 0 && (
                <div className="allergy-warning">
                  ⚠️ <strong>{t.knownAllergies}:</strong> {prescription.patientInfo.allergies.join(', ')}
                </div>
              )}

              {/* Vitals */}
              {(prescription.vitals.bp || prescription.vitals.pulse || prescription.vitals.temp) && (
                <div className="section">
                  <div className="section-title">{t.vitalSigns}</div>
                  <div className="vitals-grid">
                    {prescription.vitals.bp && (
                      <div className="vital-item">
                        <div className="vital-label">{t.bloodPressure}</div>
                        <div className="vital-value">{prescription.vitals.bp} {t.mmHg}</div>
                      </div>
                    )}
                    {prescription.vitals.pulse && (
                      <div className="vital-item">
                        <div className="vital-label">{t.pulse}</div>
                        <div className="vital-value">{prescription.vitals.pulse} {t.bpm}</div>
                      </div>
                    )}
                    {prescription.vitals.temp && (
                      <div className="vital-item">
                        <div className="vital-label">{t.temperature}</div>
                        <div className="vital-value">{prescription.vitals.temp} {t.fahrenheit}</div>
                      </div>
                    )}
                    {prescription.vitals.spo2 && (
                      <div className="vital-item">
                        <div className="vital-label">{t.spO2}</div>
                        <div className="vital-value">{prescription.vitals.spo2}%</div>
                      </div>
                    )}
                    {prescription.vitals.weight && (
                      <div className="vital-item">
                        <div className="vital-label">{t.weight}</div>
                        <div className="vital-value">{prescription.vitals.weight} {t.kg}</div>
                      </div>
                    )}
                    {prescription.vitals.height && (
                      <div className="vital-item">
                        <div className="vital-label">{t.height}</div>
                        <div className="vital-value">{prescription.vitals.height} {t.cm}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chief Complaint */}
              {prescription.chiefComplaint && (
                <div className="section">
                  <div className="section-title">{t.chiefComplaint}</div>
                  <div>{prescription.chiefComplaint}</div>
                </div>
              )}

              {/* Diagnosis */}
              {prescription.diagnosis && (
                <div className="section">
                  <div className="section-title">{t.diagnosis}</div>
                  <div>{prescription.diagnosis}</div>
                </div>
              )}

              {/* Medications */}
              {prescription.medications.length > 0 && (
                <div className="section">
                  <div className="section-title">
                    <span className="rx-symbol">℞</span>
                    {t.medications}
                  </div>
                  <table className="medication-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t.medicine}</th>
                        <th>{t.dosage}</th>
                        <th>{t.frequency}</th>
                        <th>{t.duration}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prescription.medications.map((med, index) => (
                        <tr key={med.id}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="medication-name">{med.name}</div>
                            {med.instructions && (
                              <div className="medication-details">{med.instructions}</div>
                            )}
                          </td>
                          <td>{med.dosage}</td>
                          <td>{translateFrequency(med.frequency, prescriptionLanguage)}</td>
                          <td>{translateDuration(med.duration, prescriptionLanguage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Investigations */}
              {prescription.investigations && (
                <div className="section">
                  <div className="section-title">{t.investigationsAdvised}</div>
                  <div>{prescription.investigations}</div>
                </div>
              )}

              {/* Advice */}
              {prescription.advice && (
                <div className="section">
                  <div className="section-title">{t.advice}</div>
                  <div>{prescription.advice}</div>
                </div>
              )}

              {/* Follow-up */}
              {prescription.followUp && (
                <div className="section">
                  <div className="section-title">{t.followUp}</div>
                  <div>{prescription.followUp}</div>
                </div>
              )}

              {/* Footer with Signature and Stamp */}
              <div className="footer">
                <div className="stamp-area">
                  {templateSettings?.seal && (
                    <img src={templateSettings.seal} alt={t.seal} className="seal" />
                  )}
                </div>
                <div className="signature-area">
                  {templateSettings?.signature && (
                    <img src={templateSettings.signature} alt={t.doctorSignature} className="signature" />
                  )}
                  <div className="signature-name">{doctorStamp.name}</div>
                  <div className="signature-details">{doctorStamp.qualifications}</div>
                  <div className="signature-details">{doctorStamp.specialization}</div>
                  {doctorStamp.registrationNo && (
                    <div className="signature-details">{t.registrationNo}: {doctorStamp.registrationNo}</div>
                  )}
                </div>
              </div>

              {/* Footer Text / Disclaimer */}
              <div className="disclaimer-text">
                {templateSettings?.footerText || t.disclaimer}
              </div>
            </div>
          </div>

          {/* Preview Dialog */}
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle className="text-slate-900 dark:text-white">{t.prescription} Preview</DialogTitle>
                <DialogDescription className="text-slate-600 dark:text-slate-400">Review before printing</DialogDescription>
              </DialogHeader>
              
              <div className="border rounded-lg p-6 bg-white">
                {/* Same content as print but styled for preview */}
                <div className="prescription-preview">
                  {/* Header */}
                  <div className="border-b-2 pb-4 mb-4" style={{ borderColor: templateSettings?.headerColor || '#1a56db' }}>
                    <div className="flex items-start gap-4">
                      {templateSettings?.logo && (
                        <img src={templateSettings.logo} alt="Logo" className="w-20 h-20 object-contain" />
                      )}
                      <div className="flex-1">
                        <h2 className="text-xl font-bold" style={{ color: templateSettings?.headerColor || '#1a56db' }}>
                          {clinicInfo.name}
                        </h2>
                        {clinicInfo.address && <p className="text-sm text-muted-foreground">{clinicInfo.address}</p>}
                        <p className="text-sm text-muted-foreground">
                          {clinicInfo.phone && `${t.phone}: ${clinicInfo.phone}`}
                          {clinicInfo.email && ` | ${clinicInfo.email}`}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-bold">{doctorStamp.name}</p>
                        <p className="text-muted-foreground">{doctorStamp.qualifications}</p>
                        <p>{doctorStamp.specialization}</p>
                        {doctorStamp.registrationNo && <p className="text-xs">{t.registrationNo}: {doctorStamp.registrationNo}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Patient Info */}
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded mb-4">
                    <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
                      <span><strong className="text-slate-900 dark:text-white">{t.patient}:</strong> {prescription.patientInfo.name}</span>
                      <span><strong className="text-slate-900 dark:text-white">{t.ageGender}:</strong> {prescription.patientInfo.age} {t.yrs} / {prescription.patientInfo.gender}</span>
                      <span><strong className="text-slate-900 dark:text-white">{t.date}:</strong> {new Date().toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Content sections... */}
                  {prescription.chiefComplaint && (
                    <div className="mb-3">
                      <h4 className="font-semibold text-sm border-b pb-1">{t.chiefComplaint}</h4>
                      <p className="text-sm mt-1">{prescription.chiefComplaint}</p>
                    </div>
                  )}

                  {prescription.diagnosis && (
                    <div className="mb-3">
                      <h4 className="font-semibold text-sm border-b pb-1">{t.diagnosis}</h4>
                      <p className="text-sm mt-1">{prescription.diagnosis}</p>
                    </div>
                  )}

                  {prescription.medications.length > 0 && (
                    <div className="mb-3">
                      <h4 className="font-semibold text-sm border-b pb-1 flex items-center gap-2">
                        <span className="text-2xl text-blue-600">℞</span>
                        {t.medications}
                      </h4>
                      <table className="w-full mt-2 text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-2 text-left">#</th>
                            <th className="p-2 text-left">{t.medicine}</th>
                            <th className="p-2 text-left">{t.dosage}</th>
                            <th className="p-2 text-left">{t.frequency}</th>
                            <th className="p-2 text-left">{t.duration}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prescription.medications.map((med, index) => (
                            <tr key={med.id} className="border-b">
                              <td className="p-2">{index + 1}</td>
                              <td className="p-2">
                                <span className="font-medium">{med.name}</span>
                                {med.instructions && <span className="text-xs text-muted-foreground block">{med.instructions}</span>}
                              </td>
                              <td className="p-2">{med.dosage}</td>
                              <td className="p-2">{translateFrequency(med.frequency, prescriptionLanguage)}</td>
                              <td className="p-2">{translateDuration(med.duration, prescriptionLanguage)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Disclaimer */}
                  <div className="text-xs text-center text-muted-foreground mt-4 p-2 bg-slate-50 rounded">
                    {t.disclaimer}
                  </div>

                  {/* Signature area */}
                  <div className="flex justify-between items-end mt-8 pt-4">
                    <div className="text-center">
                      {templateSettings?.seal && (
                        <img src={templateSettings.seal} alt={t.seal} className="w-20 h-20 object-contain opacity-80" />
                      )}
                    </div>
                    <div className="text-right">
                      {templateSettings?.signature && (
                        <img src={templateSettings.signature} alt={t.doctorSignature} className="w-32 h-12 object-contain ml-auto" />
                      )}
                      <p className="font-bold mt-1">{doctorStamp.name}</p>
                      <p className="text-xs text-muted-foreground">{doctorStamp.qualifications}</p>
                      {doctorStamp.registrationNo && <p className="text-xs">{t.registrationNo}: {doctorStamp.registrationNo}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </MainLayout>
  );
};

export default PrescriptionWriter;
