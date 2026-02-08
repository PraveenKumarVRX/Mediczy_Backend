/**
 * ConsultationRecorder Component
 * 
 * Complete patient-doctor consultation recording system:
 * 1. Records full conversation with real-time transcription
 * 2. AI auto-generates prescription from transcript
 * 3. Doctor can review, edit, and finalize prescription
 * 4. Generates professional PDF
 * 5. Share with attached pharmacy/lab with one click
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Mic,
  MicOff,
  Square,
  Play,
  Pause,
  Brain,
  Wand2,
  FileText,
  Download,
  Share2,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Eye,
  Pill,
  Stethoscope,
  FlaskConical,
  Building2,
  Phone,
  Mail,
  User,
  Calendar,
  Clock,
  Trash2,
  Plus,
  Copy,
  Volume2,
  VolumeX,
  Save,
  Printer,
  ExternalLink,
  Languages,
  MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from '@/utils/api';
import { useAuth } from '@/auth/AuthProvider';
import { 
  getTranslation, 
  languageOptions, 
  translateFrequency, 
  translateDuration,
  getFontForLanguage
} from "@/utils/prescriptionTranslations";

// Interfaces
interface Medication {
  id: string;
  name: string;
  composition?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity?: string;
  instructions: string;
  route?: string;
}

interface LabTest {
  id: string;
  testName: string;
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

interface PrescriptionData {
  chiefComplaints: string;
  diagnosis: string;
  medications: Medication[];
  instructions: string[];
  labTests: LabTest[];
  vitals: Vitals;
  notes?: string;
  followUpDate?: string;
}

interface PatientInfo {
  id?: number;
  name: string;
  age?: number;
  gender?: string;
  phone?: string;
  email?: string;
}

interface AttachedEntity {
  id: number;
  name: string;
  type: 'pharmacy' | 'lab';
  phone?: string;
  email?: string;
  address?: string;
}

interface ConsultationRecorderProps {
  patientInfo?: PatientInfo;
  appointmentId?: number;
  onPrescriptionSaved?: (prescriptionId: string) => void;
  onClose?: () => void;
}

// Common frequencies for dropdown
const FREQUENCIES = [
  { value: "Once daily (OD)", label: "Once daily (OD)" },
  { value: "Twice daily (BD)", label: "Twice daily (BD)" },
  { value: "Three times daily (TDS)", label: "Three times (TDS)" },
  { value: "Four times daily (QID)", label: "Four times (QID)" },
  { value: "Before meals (AC)", label: "Before meals (AC)" },
  { value: "After meals (PC)", label: "After meals (PC)" },
  { value: "At bedtime (HS)", label: "At bedtime (HS)" },
  { value: "As needed (SOS)", label: "As needed (SOS)" },
];

const DURATIONS = [
  "3 days", "5 days", "7 days", "10 days", "14 days", "21 days",
  "1 month", "2 months", "3 months", "Continuous", "As directed"
];

// Recording timer formatter
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const ConsultationRecorder: React.FC<ConsultationRecorderProps> = ({
  patientInfo,
  appointmentId,
  onPrescriptionSaved,
  onClose
}) => {
  const { toast } = useToast();
  const { currentDoctor } = useAuth();
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<'idle' | 'transcribing' | 'analyzing' | 'generating' | 'complete'>('idle');
  
  // Prescription state
  const [prescription, setPrescription] = useState<PrescriptionData>({
    chiefComplaints: '',
    diagnosis: '',
    medications: [],
    instructions: [],
    labTests: [],
    vitals: {},
    notes: '',
    followUpDate: ''
  });
  
  // UI state
  const [activeTab, setActiveTab] = useState('record');
  const [prescriptionLanguage, setPrescriptionLanguage] = useState('en');
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPrescriptionId, setSavedPrescriptionId] = useState<string | null>(null);
  
  // Share state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [attachedPharmacies, setAttachedPharmacies] = useState<AttachedEntity[]>([]);
  const [attachedLabs, setAttachedLabs] = useState<AttachedEntity[]>([]);
  const [selectedShareEntities, setSelectedShareEntities] = useState<number[]>([]);
  const [shareMethod, setShareMethod] = useState<'email' | 'sms' | 'whatsapp'>('whatsapp');
  
  // Translation helper
  const t = getTranslation(prescriptionLanguage);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Indian English
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPiece + ' ';
          } else {
            interimText += transcriptPiece;
          }
        }

        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript);
        }
        setInterimTranscript(interimText);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          toast({
            variant: "destructive",
            title: "Recording Error",
            description: `Speech recognition error: ${event.error}`,
          });
        }
      };

      recognition.onend = () => {
        // Restart if still recording
        if (isRecording && !isPaused) {
          try {
            recognition.start();
          } catch (e) {
            console.log('Recognition restart failed:', e);
          }
        }
      };

      recognitionRef.current = recognition;
    } else {
      toast({
        variant: "destructive",
        title: "Browser Not Supported",
        description: "Speech recognition is not supported in your browser. Please use Chrome or Edge.",
      });
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Fetch attached pharmacies and labs
  useEffect(() => {
    fetchAttachedEntities();
  }, []);

  const fetchAttachedEntities = async () => {
    try {
      // Fetch doctor's attached pharmacies
      const pharmacyRes = await api.get('/doctors/attached-pharmacies').catch(() => ({ data: { pharmacies: [] } }));
      setAttachedPharmacies(pharmacyRes.data.pharmacies?.map((p: any) => ({
        id: p.id,
        name: p.name || p.pharmacyName,
        type: 'pharmacy' as const,
        phone: p.phone || p.phoneNumber,
        email: p.email,
        address: p.address
      })) || []);

      // Fetch doctor's attached labs
      const labRes = await api.get('/doctors/attached-labs').catch(() => ({ data: { labs: [] } }));
      setAttachedLabs(labRes.data.labs?.map((l: any) => ({
        id: l.id,
        name: l.name || l.labName,
        type: 'lab' as const,
        phone: l.phone || l.phoneNumber,
        email: l.email,
        address: l.address
      })) || []);
    } catch (error) {
      console.error('Failed to fetch attached entities:', error);
    }
  };

  // Recording controls
  const startRecording = () => {
    if (!recognitionRef.current) {
      toast({
        variant: "destructive",
        title: "Not Available",
        description: "Speech recognition is not available",
      });
      return;
    }

    try {
      recognitionRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast({
        title: "🎤 Recording Started",
        description: "Speak naturally - the consultation is being transcribed",
      });
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      toast({
        variant: "destructive",
        title: "Recording Failed",
        description: error.message || "Could not start recording",
      });
    }
  };

  const pauseRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsPaused(true);
  };

  const resumeRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
    setIsPaused(false);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsRecording(false);
    setIsPaused(false);
    setInterimTranscript('');

    toast({
      title: "⏹️ Recording Stopped",
      description: `${formatTime(recordingTime)} of consultation recorded`,
    });
  };

  // Generate prescription from transcript using AI
  const generatePrescription = async () => {
    if (!transcript.trim()) {
      toast({
        variant: "destructive",
        title: "No Transcript",
        description: "Please record some consultation first",
      });
      return;
    }

    setIsProcessing(true);
    setProcessingStage('analyzing');

    try {
      const response = await api.post('/ai/generate-prescription', {
        consultationNotes: transcript,
        sessionNotes: transcript.split('. ').filter(s => s.trim()),
        existingData: {},
        patientInfo: patientInfo
      });

      if (response.data.success) {
        setProcessingStage('generating');
        
        const aiPrescription = response.data.prescription;
        
        // Transform AI response to our format
        setPrescription({
          chiefComplaints: aiPrescription.chiefComplaints || '',
          diagnosis: aiPrescription.diagnosis || '',
          medications: (aiPrescription.medications || []).map((med: any, idx: number) => ({
            id: `med-${idx}-${Date.now()}`,
            name: med.name || '',
            composition: med.composition || '',
            dosage: med.dosage || '',
            frequency: med.frequency || 'Once daily (OD)',
            duration: med.duration || '5 days',
            quantity: med.quantity || '',
            instructions: med.instructions || 'After meals',
            route: med.route || 'Oral'
          })),
          instructions: aiPrescription.instructions || [],
          labTests: (aiPrescription.labTests || []).map((test: any, idx: number) => ({
            id: `test-${idx}-${Date.now()}`,
            testName: typeof test === 'string' ? test : test.testName || test.name,
            instructions: typeof test === 'object' ? test.instructions : ''
          })),
          vitals: aiPrescription.vitals || {},
          notes: aiPrescription.notes || '',
          followUpDate: aiPrescription.followUpDate || ''
        });

        setProcessingStage('complete');
        setActiveTab('review');

        toast({
          title: "✅ Prescription Generated",
          description: "AI has analyzed the consultation and generated a prescription. Please review and edit.",
        });
      }
    } catch (error: any) {
      console.error('Prescription generation error:', error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: error.response?.data?.message || "Failed to generate prescription from transcript",
      });
    } finally {
      setIsProcessing(false);
      setProcessingStage('idle');
    }
  };

  // Medication management
  const addMedication = () => {
    setPrescription(prev => ({
      ...prev,
      medications: [...prev.medications, {
        id: `med-${Date.now()}`,
        name: '',
        dosage: '',
        frequency: 'Once daily (OD)',
        duration: '5 days',
        instructions: 'After meals',
        route: 'Oral'
      }]
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

  // Lab test management
  const addLabTest = () => {
    setPrescription(prev => ({
      ...prev,
      labTests: [...prev.labTests, {
        id: `test-${Date.now()}`,
        testName: '',
        instructions: ''
      }]
    }));
  };

  const updateLabTest = (id: string, field: keyof LabTest, value: string) => {
    setPrescription(prev => ({
      ...prev,
      labTests: prev.labTests.map(test =>
        test.id === id ? { ...test, [field]: value } : test
      )
    }));
  };

  const removeLabTest = (id: string) => {
    setPrescription(prev => ({
      ...prev,
      labTests: prev.labTests.filter(test => test.id !== id)
    }));
  };

  // Instruction management
  const addInstruction = () => {
    setPrescription(prev => ({
      ...prev,
      instructions: [...prev.instructions, '']
    }));
  };

  const updateInstruction = (index: number, value: string) => {
    setPrescription(prev => ({
      ...prev,
      instructions: prev.instructions.map((inst, i) => i === index ? value : inst)
    }));
  };

  const removeInstruction = (index: number) => {
    setPrescription(prev => ({
      ...prev,
      instructions: prev.instructions.filter((_, i) => i !== index)
    }));
  };

  // Save prescription
  const savePrescription = async (finalize: boolean = false) => {
    if (!prescription.diagnosis) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please add a diagnosis before saving",
      });
      return;
    }

    if (prescription.medications.length === 0) {
      toast({
        variant: "destructive",
        title: "Missing Medications",
        description: "Please add at least one medication",
      });
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        appointmentId,
        patientId: patientInfo?.id,
        patientName: patientInfo?.name || 'Patient',
        patientAge: patientInfo?.age,
        patientGender: patientInfo?.gender,
        patientPhone: patientInfo?.phone,
        diagnosis: prescription.diagnosis,
        chiefComplaints: prescription.chiefComplaints,
        medications: prescription.medications.map(med => ({
          name: med.name,
          composition: med.composition,
          dosage: med.dosage,
          frequency: med.frequency,
          duration: med.duration,
          quantity: med.quantity,
          instructions: med.instructions
        })),
        labTests: prescription.labTests.map(test => ({
          testName: test.testName,
          instructions: test.instructions
        })),
        instructions: prescription.instructions.filter(i => i.trim()),
        vitals: prescription.vitals,
        notes: prescription.notes,
        followUpDate: prescription.followUpDate,
        consultationTranscript: transcript,
        language: prescriptionLanguage,
        status: finalize ? 'active' : 'draft'
      };

      let response;
      if (appointmentId) {
        response = await api.post(`/prescriptions/from-appointment/${appointmentId}`, payload);
      } else {
        response = await api.post('/prescriptions', payload);
      }

      if (response.data.success) {
        const prescriptionId = response.data.prescription.prescriptionId;
        setSavedPrescriptionId(prescriptionId);
        
        toast({
          title: finalize ? "✅ Prescription Saved & Finalized" : "💾 Prescription Saved as Draft",
          description: `Prescription ID: ${prescriptionId}`,
        });

        if (onPrescriptionSaved) {
          onPrescriptionSaved(prescriptionId);
        }

        if (finalize) {
          setShowShareDialog(true);
        }
      }
    } catch (error: any) {
      console.error('Save prescription error:', error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.response?.data?.message || "Failed to save prescription",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Share prescription
  const sharePrescription = async () => {
    if (!savedPrescriptionId) {
      toast({
        variant: "destructive",
        title: "Save First",
        description: "Please save the prescription before sharing",
      });
      return;
    }

    try {
      // Share with selected entities
      for (const entityId of selectedShareEntities) {
        const entity = [...attachedPharmacies, ...attachedLabs].find(e => e.id === entityId);
        if (!entity) continue;

        await api.post(`/prescriptions/${savedPrescriptionId}/share`, {
          entityId: entity.id,
          entityType: entity.type,
          method: shareMethod,
          contact: shareMethod === 'email' ? entity.email : entity.phone
        });
      }

      toast({
        title: "✅ Prescription Shared",
        description: `Shared with ${selectedShareEntities.length} ${selectedShareEntities.length === 1 ? 'entity' : 'entities'}`,
      });

      setShowShareDialog(false);
    } catch (error: any) {
      console.error('Share error:', error);
      toast({
        variant: "destructive",
        title: "Share Failed",
        description: error.response?.data?.message || "Failed to share prescription",
      });
    }
  };

  // Download PDF
  const downloadPDF = async () => {
    if (!savedPrescriptionId) {
      toast({
        variant: "destructive",
        title: "Save First",
        description: "Please save the prescription first to download PDF",
      });
      return;
    }

    try {
      window.open(`/api/prescriptions/${savedPrescriptionId}/pdf`, '_blank');
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Failed to download PDF",
      });
    }
  };

  // Print prescription
  const printPrescription = () => {
    if (!savedPrescriptionId) {
      // Generate print preview from current data
      generatePrintPreview();
    } else {
      window.open(`/api/prescriptions/${savedPrescriptionId}/pdf`, '_blank');
    }
  };

  const generatePrintPreview = () => {
    const fontFamily = getFontForLanguage(prescriptionLanguage);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const doctorName = currentDoctor ? 
      `Dr. ${currentDoctor.firstName || ''} ${currentDoctor.lastName || ''}`.trim() : 
      'Doctor';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${t.prescription} - ${patientInfo?.name || 'Patient'}</title>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil&family=Noto+Sans+Devanagari&family=Noto+Sans+Telugu&family=Noto+Sans+Kannada&family=Noto+Sans+Malayalam&family=Noto+Sans+Bengali&display=swap" rel="stylesheet">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: ${fontFamily}; font-size: 12pt; line-height: 1.6; padding: 20mm; }
            .header { text-align: center; border-bottom: 2px solid #1a56db; padding-bottom: 15px; margin-bottom: 20px; }
            .doctor-name { font-size: 18pt; font-weight: bold; color: #1a56db; }
            .patient-section { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .section { margin-bottom: 15px; }
            .section-title { font-weight: bold; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
            .rx-symbol { font-size: 24pt; color: #1a56db; }
            .med-table { width: 100%; border-collapse: collapse; }
            .med-table th, .med-table td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
            .med-table th { background: #f0f0f0; }
            .footer { margin-top: 40px; text-align: right; }
            @media print { body { padding: 10mm; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="doctor-name">${doctorName}</div>
            <div>${currentDoctor?.specialization || 'General Medicine'}</div>
          </div>
          
          <div class="patient-section">
            <strong>${t.patient}:</strong> ${patientInfo?.name || 'N/A'} | 
            <strong>${t.ageGender}:</strong> ${patientInfo?.age || 'N/A'} ${t.yrs} / ${patientInfo?.gender || 'N/A'} |
            <strong>${t.date}:</strong> ${new Date().toLocaleDateString('en-IN')}
          </div>

          ${prescription.chiefComplaints ? `
            <div class="section">
              <div class="section-title">${t.chiefComplaint}</div>
              <div>${prescription.chiefComplaints}</div>
            </div>
          ` : ''}

          <div class="section">
            <div class="section-title">${t.diagnosis}</div>
            <div>${prescription.diagnosis}</div>
          </div>

          <div class="section">
            <div class="section-title"><span class="rx-symbol">℞</span> ${t.medications}</div>
            <table class="med-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>${t.medicine}</th>
                  <th>${t.dosage}</th>
                  <th>${t.frequency}</th>
                  <th>${t.duration}</th>
                </tr>
              </thead>
              <tbody>
                ${prescription.medications.map((med, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${med.name} ${med.composition ? `(${med.composition})` : ''}</td>
                    <td>${med.dosage}</td>
                    <td>${translateFrequency(med.frequency, prescriptionLanguage)}</td>
                    <td>${translateDuration(med.duration, prescriptionLanguage)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          ${prescription.labTests.length > 0 ? `
            <div class="section">
              <div class="section-title">${t.investigationsAdvised}</div>
              <ul>
                ${prescription.labTests.map(test => `<li>🔬 ${test.testName}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${prescription.instructions.length > 0 ? `
            <div class="section">
              <div class="section-title">${t.advice}</div>
              <ul>
                ${prescription.instructions.map(inst => `<li>✓ ${inst}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${prescription.followUpDate ? `
            <div class="section">
              <div class="section-title">${t.followUp}</div>
              <div>${new Date(prescription.followUpDate).toLocaleDateString('en-IN')}</div>
            </div>
          ` : ''}

          <div class="footer">
            <div style="margin-top: 50px; border-top: 1px solid #333; padding-top: 5px;">
              <strong>${doctorName}</strong><br/>
              ${currentDoctor?.specialization || ''}
            </div>
          </div>

          <div style="text-align: center; margin-top: 20px; font-size: 9pt; color: #666;">
            ${t.disclaimer}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl">AI Consultation Recorder</CardTitle>
              <CardDescription className="text-purple-100">
                Record consultation → AI generates prescription → Review & Share
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={prescriptionLanguage} onValueChange={setPrescriptionLanguage}>
              <SelectTrigger className="w-[150px] bg-white/20 border-white/30 text-white">
                <Languages className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map(lang => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.nativeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="record" className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Record
            </TabsTrigger>
            <TabsTrigger value="review" className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Review & Edit
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="share" className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Share
            </TabsTrigger>
          </TabsList>

          {/* RECORD TAB */}
          <TabsContent value="record" className="space-y-6">
            {/* Patient Info Card */}
            {patientInfo && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <User className="h-10 w-10 text-blue-600 p-2 bg-blue-100 rounded-full" />
                    <div>
                      <p className="font-semibold text-blue-900">{patientInfo.name}</p>
                      <p className="text-sm text-blue-700">
                        {patientInfo.age && `${patientInfo.age} years`}
                        {patientInfo.gender && ` • ${patientInfo.gender}`}
                        {patientInfo.phone && ` • ${patientInfo.phone}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recording Controls */}
            <Card className="border-2 border-dashed border-purple-300 bg-purple-50">
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  {/* Recording Timer */}
                  <div className="text-4xl font-mono font-bold text-purple-700">
                    {formatTime(recordingTime)}
                  </div>

                  {/* Recording Status */}
                  {isRecording && (
                    <div className="flex items-center justify-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
                      <span className={`text-sm font-medium ${isPaused ? 'text-yellow-700' : 'text-red-700'}`}>
                        {isPaused ? 'Paused' : 'Recording...'}
                      </span>
                    </div>
                  )}

                  {/* Control Buttons */}
                  <div className="flex justify-center gap-3">
                    {!isRecording ? (
                      <Button
                        size="lg"
                        onClick={startRecording}
                        className="bg-red-500 hover:bg-red-600 text-white px-8"
                      >
                        <Mic className="h-5 w-5 mr-2" />
                        Start Recording
                      </Button>
                    ) : (
                      <>
                        {isPaused ? (
                          <Button size="lg" onClick={resumeRecording} className="bg-green-500 hover:bg-green-600">
                            <Play className="h-5 w-5 mr-2" />
                            Resume
                          </Button>
                        ) : (
                          <Button size="lg" onClick={pauseRecording} variant="outline">
                            <Pause className="h-5 w-5 mr-2" />
                            Pause
                          </Button>
                        )}
                        <Button size="lg" onClick={stopRecording} variant="destructive">
                          <Square className="h-5 w-5 mr-2" />
                          Stop
                        </Button>
                      </>
                    )}
                  </div>

                  <p className="text-sm text-purple-600">
                    🎤 Speak naturally during the consultation. The conversation will be transcribed automatically.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Live Transcript */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Consultation Transcript
              </Label>
              <Textarea
                value={transcript + (interimTranscript ? ` ${interimTranscript}` : '')}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="The consultation transcript will appear here as you speak..."
                className="min-h-[200px] font-mono text-sm"
                style={{ 
                  color: interimTranscript ? '#666' : 'inherit'
                }}
              />
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {transcript.split(' ').filter(w => w).length} words transcribed
                </p>
                {transcript && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTranscript('')}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={generatePrescription}
                disabled={!transcript.trim() || isProcessing}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 px-8"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    {processingStage === 'analyzing' ? 'Analyzing...' : 'Generating...'}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-5 w-5 mr-2" />
                    Generate Prescription with AI
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* REVIEW & EDIT TAB */}
          <TabsContent value="review" className="space-y-6">
            {/* Chief Complaints & Diagnosis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.chiefComplaint}</Label>
                <Textarea
                  value={prescription.chiefComplaints}
                  onChange={(e) => setPrescription(prev => ({ ...prev, chiefComplaints: e.target.value }))}
                  placeholder="Enter chief complaints..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.diagnosis} *</Label>
                <Textarea
                  value={prescription.diagnosis}
                  onChange={(e) => setPrescription(prev => ({ ...prev, diagnosis: e.target.value }))}
                  placeholder="Enter diagnosis..."
                  rows={3}
                  required
                />
              </div>
            </div>

            {/* Vitals */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" />
                  {t.vitalSigns}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <Label className="text-xs">{t.bloodPressure}</Label>
                    <Input
                      value={prescription.vitals.bloodPressure || ''}
                      onChange={(e) => setPrescription(prev => ({
                        ...prev,
                        vitals: { ...prev.vitals, bloodPressure: e.target.value }
                      }))}
                      placeholder="120/80"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t.pulse}</Label>
                    <Input
                      value={prescription.vitals.pulse || ''}
                      onChange={(e) => setPrescription(prev => ({
                        ...prev,
                        vitals: { ...prev.vitals, pulse: e.target.value }
                      }))}
                      placeholder="72"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t.temperature}</Label>
                    <Input
                      value={prescription.vitals.temperature || ''}
                      onChange={(e) => setPrescription(prev => ({
                        ...prev,
                        vitals: { ...prev.vitals, temperature: e.target.value }
                      }))}
                      placeholder="98.6"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t.weight}</Label>
                    <Input
                      value={prescription.vitals.weight || ''}
                      onChange={(e) => setPrescription(prev => ({
                        ...prev,
                        vitals: { ...prev.vitals, weight: e.target.value }
                      }))}
                      placeholder="70"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t.height}</Label>
                    <Input
                      value={prescription.vitals.height || ''}
                      onChange={(e) => setPrescription(prev => ({
                        ...prev,
                        vitals: { ...prev.vitals, height: e.target.value }
                      }))}
                      placeholder="170"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t.spO2}</Label>
                    <Input
                      value={prescription.vitals.spo2 || ''}
                      onChange={(e) => setPrescription(prev => ({
                        ...prev,
                        vitals: { ...prev.vitals, spo2: e.target.value }
                      }))}
                      placeholder="98"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Medications */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Pill className="h-4 w-4" />
                    {t.medications} ({prescription.medications.length})
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={addMedication}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-3">
                    {prescription.medications.map((med, idx) => (
                      <Card key={med.id} className="p-3 bg-muted/40">
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-1 flex items-center justify-center pt-2">
                            <Badge variant="secondary">{idx + 1}</Badge>
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs">{t.medicine}</Label>
                            <Input
                              value={med.name}
                              onChange={(e) => updateMedication(med.id, 'name', e.target.value)}
                              placeholder="Medicine name"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">{t.dosage}</Label>
                            <Input
                              value={med.dosage}
                              onChange={(e) => updateMedication(med.id, 'dosage', e.target.value)}
                              placeholder="500mg"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">{t.frequency}</Label>
                            <Select
                              value={med.frequency}
                              onValueChange={(v) => updateMedication(med.id, 'frequency', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FREQUENCIES.map(f => (
                                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">{t.duration}</Label>
                            <Select
                              value={med.duration}
                              onValueChange={(v) => updateMedication(med.id, 'duration', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DURATIONS.map(d => (
                                  <SelectItem key={d} value={d}>{d}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-xs">&nbsp;</Label>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMedication(med.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="col-span-11 col-start-2">
                            <Label className="text-xs">{t.instructions}</Label>
                            <Input
                              value={med.instructions}
                              onChange={(e) => updateMedication(med.id, 'instructions', e.target.value)}
                              placeholder="After meals, etc."
                            />
                          </div>
                        </div>
                      </Card>
                    ))}
                    {prescription.medications.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No medications added. Click "Add" to add medications.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Lab Tests */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FlaskConical className="h-4 w-4" />
                    {t.investigationsAdvised} ({prescription.labTests.length})
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={addLabTest}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {prescription.labTests.map((test, idx) => (
                    <div key={test.id} className="flex gap-2 items-center">
                      <Badge variant="outline">{idx + 1}</Badge>
                      <Input
                        value={test.testName}
                        onChange={(e) => updateLabTest(test.id, 'testName', e.target.value)}
                        placeholder="Test name (e.g., CBC, Blood Sugar)"
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLabTest(test.id)}
                        className="text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t.advice}</CardTitle>
                  <Button size="sm" variant="outline" onClick={addInstruction}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {prescription.instructions.map((inst, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <Badge variant="outline">{idx + 1}</Badge>
                      <Input
                        value={inst}
                        onChange={(e) => updateInstruction(idx, e.target.value)}
                        placeholder="Enter instruction..."
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInstruction(idx)}
                        className="text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Follow-up & Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.followUp}</Label>
                <Input
                  type="date"
                  value={prescription.followUpDate}
                  onChange={(e) => setPrescription(prev => ({ ...prev, followUpDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={prescription.notes || ''}
                  onChange={(e) => setPrescription(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                />
              </div>
            </div>
          </TabsContent>

          {/* PREVIEW TAB */}
          <TabsContent value="preview" className="space-y-4">
            <Card className="p-6 bg-card border-2">
              {/* Prescription Preview Content */}
              <div className="space-y-4">
                {/* Header */}
                <div className="text-center border-b-2 border-blue-600 pb-4">
                  <h2 className="text-xl font-bold text-blue-600">
                    {currentDoctor ? `Dr. ${currentDoctor.firstName || ''} ${currentDoctor.lastName || ''}`.trim() : 'Doctor'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {currentDoctor?.specialization || 'General Medicine'}
                  </p>
                </div>

                {/* Patient Info */}
                <div className="bg-muted/60 p-3 rounded">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span><strong>{t.patient}:</strong> {patientInfo?.name || 'N/A'}</span>
                    <span><strong>{t.ageGender}:</strong> {patientInfo?.age || 'N/A'} {t.yrs} / {patientInfo?.gender || 'N/A'}</span>
                    <span><strong>{t.date}:</strong> {new Date().toLocaleDateString('en-IN')}</span>
                  </div>
                </div>

                {/* Chief Complaints */}
                {prescription.chiefComplaints && (
                  <div>
                    <h4 className="font-semibold border-b pb-1">{t.chiefComplaint}</h4>
                    <p className="mt-1">{prescription.chiefComplaints}</p>
                  </div>
                )}

                {/* Diagnosis */}
                <div>
                  <h4 className="font-semibold border-b pb-1">{t.diagnosis}</h4>
                  <p className="mt-1">{prescription.diagnosis || 'Not specified'}</p>
                </div>

                {/* Medications */}
                {prescription.medications.length > 0 && (
                  <div>
                    <h4 className="font-semibold border-b pb-1 flex items-center gap-2">
                      <span className="text-2xl text-blue-600">℞</span>
                      {t.medications}
                    </h4>
                    <table className="w-full mt-2 text-sm">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">{t.medicine}</th>
                          <th className="p-2 text-left">{t.dosage}</th>
                          <th className="p-2 text-left">{t.frequency}</th>
                          <th className="p-2 text-left">{t.duration}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prescription.medications.map((med, idx) => (
                          <tr key={med.id} className="border-b">
                            <td className="p-2">{idx + 1}</td>
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

                {/* Lab Tests */}
                {prescription.labTests.length > 0 && (
                  <div>
                    <h4 className="font-semibold border-b pb-1">{t.investigationsAdvised}</h4>
                    <ul className="mt-1 space-y-1">
                      {prescription.labTests.map((test) => (
                        <li key={test.id}>🔬 {test.testName}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Instructions */}
                {prescription.instructions.length > 0 && (
                  <div>
                    <h4 className="font-semibold border-b pb-1">{t.advice}</h4>
                    <ul className="mt-1 space-y-1">
                      {prescription.instructions.map((inst, idx) => (
                        <li key={idx}>✓ {inst}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Follow-up */}
                {prescription.followUpDate && (
                  <div>
                    <h4 className="font-semibold border-b pb-1">{t.followUp}</h4>
                    <p className="mt-1">{new Date(prescription.followUpDate).toLocaleDateString('en-IN')}</p>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="text-xs text-center text-muted-foreground mt-4 p-2 bg-muted/40 rounded">
                  {t.disclaimer}
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* SHARE TAB */}
          <TabsContent value="share" className="space-y-6">
            {!savedPrescriptionId ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Save Required</AlertTitle>
                <AlertDescription>
                  Please save the prescription first before sharing.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Prescription Saved</AlertTitle>
                  <AlertDescription className="text-green-700">
                    ID: {savedPrescriptionId}
                  </AlertDescription>
                </Alert>

                {/* Share with Pharmacy */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Share with Attached Pharmacy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {attachedPharmacies.length > 0 ? (
                      <div className="space-y-2">
                        {attachedPharmacies.map((pharmacy) => (
                          <div key={pharmacy.id} className="flex items-center justify-between p-3 bg-muted/40 rounded">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={selectedShareEntities.includes(pharmacy.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedShareEntities([...selectedShareEntities, pharmacy.id]);
                                  } else {
                                    setSelectedShareEntities(selectedShareEntities.filter(id => id !== pharmacy.id));
                                  }
                                }}
                              />
                              <div>
                                <p className="font-medium">{pharmacy.name}</p>
                                <p className="text-xs text-muted-foreground">{pharmacy.phone} • {pharmacy.email}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No pharmacies attached. Go to Settings to add pharmacies.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Share with Lab */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FlaskConical className="h-4 w-4" />
                      Share with Attached Lab
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {attachedLabs.length > 0 ? (
                      <div className="space-y-2">
                        {attachedLabs.map((lab) => (
                          <div key={lab.id} className="flex items-center justify-between p-3 bg-muted/40 rounded">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={selectedShareEntities.includes(lab.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedShareEntities([...selectedShareEntities, lab.id]);
                                  } else {
                                    setSelectedShareEntities(selectedShareEntities.filter(id => id !== lab.id));
                                  }
                                }}
                              />
                              <div>
                                <p className="font-medium">{lab.name}</p>
                                <p className="text-xs text-muted-foreground">{lab.phone} • {lab.email}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No labs attached. Go to Settings to add labs.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Share Method */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Share Method</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        variant={shareMethod === 'whatsapp' ? 'default' : 'outline'}
                        onClick={() => setShareMethod('whatsapp')}
                        className={shareMethod === 'whatsapp' ? 'bg-green-600' : ''}
                      >
                        WhatsApp
                      </Button>
                      <Button
                        variant={shareMethod === 'email' ? 'default' : 'outline'}
                        onClick={() => setShareMethod('email')}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </Button>
                      <Button
                        variant={shareMethod === 'sms' ? 'default' : 'outline'}
                        onClick={() => setShareMethod('sms')}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        SMS
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {selectedShareEntities.length > 0 && (
                  <Button
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600"
                    onClick={sharePrescription}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Share with {selectedShareEntities.length} Selected
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="border-t bg-muted/40 flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" onClick={printPrescription}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {savedPrescriptionId && (
            <Button variant="outline" onClick={downloadPDF}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => savePrescription(false)}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Draft
          </Button>
          <Button
            onClick={() => savePrescription(true)}
            disabled={isSaving}
            className="bg-gradient-to-r from-purple-600 to-indigo-600"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Save & Finalize
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default ConsultationRecorder;
