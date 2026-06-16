import { useState, useEffect } from "react";
import {
  Plus,
  Bell,
  Calendar,
  Clock,
  Pill,
  RefreshCw,
  Trash2,
  Edit2,
  AlertTriangle,
  CheckCircle,
  ShoppingCart,
  Brain,
  MessageSquare,
  Zap,
  MapPin,
  Phone,
  Star,
  History,
  Shield,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DrISHAChat from "@/components/DrISHAChat";
import { drIshaAPI } from "@/services/drIsha";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  timeOfDay: string[];
  remainingQuantity: number;
  refillThreshold: number;
  nextRefillDate: string;
  category: string;
  prescribedBy?: string;
  sideEffects?: string[];
  contraindications?: string[];
  interactions?: string[];
  instructions?: string;
  startDate: string;
  endDate?: string;
  imageUrl?: string;
  prescriptionId?: number;
  medicationKey?: string;
  fromPrescription?: boolean;
}

interface Reminder {
  id: string;
  medicationId: string;
  time: string;
  taken: boolean;
  date: string;
}

interface DrugInteraction {
  id: string;
  medication1: string;
  medication2: string;
  severity: 'minor' | 'moderate' | 'major';
  description: string;
  recommendation: string;
}

interface Pharmacy {
  id: string;
  name: string;
  address: string;
  phone: string;
  rating: number;
  distance: string;
  availability: boolean;
}

interface AdherenceData {
  date: string;
  medications: { id: string; taken: boolean }[];
  score: number;
}

const frequencyToTimes = (frequency = ""): string[] => {
  const f = frequency.toLowerCase();
  if (f.includes("twice") || f.includes("bd") || f.includes("bid")) return ["08:00", "20:00"];
  if (f.includes("thrice") || f.includes("tds") || f.includes("tid")) return ["08:00", "14:00", "20:00"];
  if (f.includes("four") || f.includes("qid")) return ["06:00", "12:00", "18:00", "22:00"];
  return ["08:00"];
};

export default function MedicinePage() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("medications");
  const [overallAdherenceRate, setOverallAdherenceRate] = useState<number | null>(null);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [medications, setMedications] = useState<Medication[]>(() => {
    const saved = localStorage.getItem('medications');
    return saved ? JSON.parse(saved) : [];
  });

  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem('reminders');
    return saved ? JSON.parse(saved) : [];
  });

  const [drugInteractions, setDrugInteractions] = useState<DrugInteraction[]>([]);
  const [adherenceData, setAdherenceData] = useState<AdherenceData[]>([]);
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [isAddingMed, setIsAddingMed] = useState(false);
  const [newMedication, setNewMedication] = useState<Partial<Medication>>({});
  const [nearbyPharmacies] = useState<Pharmacy[]>([
    {
      id: '1',
      name: 'HealthCare Pharmacy',
      address: '123 Medical Street, Delhi',
      phone: '+91-11-12345678',
      rating: 4.5,
      distance: '0.5 km',
      availability: true
    },
    {
      id: '2', 
      name: 'MedPlus',
      address: '456 Wellness Road, Delhi',
      phone: '+91-11-87654321',
      rating: 4.2,
      distance: '1.2 km',
      availability: true
    }
  ]);

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('medications', JSON.stringify(medications));
    localStorage.setItem('reminders', JSON.stringify(reminders));
  }, [medications, reminders]);

  const loadPrescriptionMedications = async () => {
    if (!currentUser?._id && !currentUser?.id) return;

    setLoadingPrescriptions(true);
    try {
      const [rxRes, adherenceRes] = await Promise.all([
        api.get("/prescriptions/patient"),
        api.get("/prescriptions/patient/adherence-summary"),
      ]);

      const prescriptions = rxRes.data?.prescriptions || [];
      if (typeof adherenceRes.data?.overallAdherenceRate === "number") {
        setOverallAdherenceRate(adherenceRes.data.overallAdherenceRate);
      }

      const adherenceByRx = new Map(
        (adherenceRes.data?.prescriptions || []).map((item: { prescriptionId: number; adherenceTracking?: Record<string, Record<string, boolean>> }) => [
          item.prescriptionId,
          item,
        ])
      );

      const prescriptionMeds: Medication[] = [];
      const newReminders: Reminder[] = [];
      const today = new Date().toISOString().split("T")[0];

      prescriptions.forEach((rx: {
        id: number;
        doctorName?: string;
        followUpDate?: string;
        issuedAt?: string;
        medications?: Array<{ name: string; dosage?: string; dose?: string; frequency?: string; quantity?: string; instructions?: string }>;
      }) => {
        (rx.medications || []).forEach((med, index) => {
          const medKey = `${med.name || "med"}-${index}`;
          const id = `rx-${rx.id}-${index}`;
          const timeOfDay = frequencyToTimes(med.frequency || "daily");
          const tracking = adherenceByRx.get(rx.id)?.adherenceTracking?.[today] || {};

          prescriptionMeds.push({
            id,
            prescriptionId: rx.id,
            medicationKey: medKey,
            fromPrescription: true,
            name: med.name,
            dosage: med.dosage || med.dose || "",
            frequency: med.frequency || "daily",
            timeOfDay,
            remainingQuantity: Number.parseInt(med.quantity || "", 10) || 30,
            refillThreshold: 5,
            nextRefillDate: rx.followUpDate || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
            category: "Prescribed",
            prescribedBy: rx.doctorName || "",
            instructions: med.instructions || "",
            startDate: rx.issuedAt?.split("T")[0] || today,
          });

          timeOfDay.forEach((time, tIndex) => {
            newReminders.push({
              id: `${id}-${tIndex}`,
              medicationId: id,
              time,
              taken: tracking[medKey] === true,
              date: today,
            });
          });
        });
      });

      setMedications((prev) => {
        const manual = prev.filter((m) => !m.fromPrescription);
        return [...manual, ...prescriptionMeds];
      });
      setReminders((prev) => {
        const manual = prev.filter((r) => !r.medicationId.startsWith("rx-"));
        return [...manual, ...newReminders];
      });
    } catch (error) {
      console.error("Failed to load prescriptions:", error);
    } finally {
      setLoadingPrescriptions(false);
    }
  };

  // Check for notifications permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    loadPrescriptionMedications();
  }, [currentUser?._id, currentUser?.id]);

  // Check for reminders every minute
  useEffect(() => {
    const interval = setInterval(() => {
      checkReminders();
    }, 60000);

    return () => clearInterval(interval);
  }, [reminders]);

  // Check for drug interactions when medications change
  useEffect(() => {
    if (medications.length > 1) {
      checkDrugInteractions();
    }
  }, [medications]);

  const checkReminders = () => {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5);
    const today = now.toISOString().split('T')[0];

    reminders.forEach(reminder => {
      if (reminder.time === currentTime && reminder.date === today && !reminder.taken) {
        const medication = medications.find(med => med.id === reminder.medicationId);
        if (medication) {
          sendNotification(medication.name);
        }
      }
    });
  };

  const sendNotification = (medicationName: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Medicine Reminder', {
        body: `Time to take your ${medicationName}`,
        icon: '/medicine-icon.png'
      });
    }
    toast.info(`Time to take your ${medicationName}`);
  };

  // AI-powered drug interaction checker
  const checkDrugInteractions = async () => {
    if (medications.length < 2) return;

    setAiAnalyzing(true);
    try {
      const medicationList = medications.map(med => `${med.name} ${med.dosage}`).join(', ');
      
      const query = `Please check for drug interactions and safety concerns:

      Current Medications:
      ${medicationList}

      Please analyze:
      1. Potential drug-drug interactions
      2. Severity levels (minor/moderate/major)
      3. Clinical recommendations
      4. Alternative suggestions if needed
      5. Timing considerations

      Provide detailed analysis with safety recommendations.`;

      const result = await drIshaAPI.consult(query, 'en', {
        analysisType: 'drug_interaction_check',
        medications: medications
      });

      if (result.success && result.data) {
        const interactions = parseInteractionResponse(result.data.response);
        setDrugInteractions(interactions);
      }
    } catch (error) {
      console.error('Drug interaction check error:', error);
    }
    setAiAnalyzing(false);
  };

  const parseInteractionResponse = (response: string): DrugInteraction[] => {
    const interactions: DrugInteraction[] = [];
    
    // Simple parsing - in real app, this would be more sophisticated
    if (medications.length >= 2) {
      // Check common interaction patterns
      const hasBloodThinner = medications.some(med => 
        med.name.toLowerCase().includes('warfarin') || 
        med.name.toLowerCase().includes('aspirin')
      );
      const hasACEInhibitor = medications.some(med =>
        med.name.toLowerCase().includes('lisinopril') ||
        med.name.toLowerCase().includes('enalapril')
      );

      if (hasBloodThinner && hasACEInhibitor) {
        interactions.push({
          id: '1',
          medication1: 'Blood Thinner',
          medication2: 'ACE Inhibitor',
          severity: 'moderate',
          description: 'Potential increased bleeding risk when combining blood thinners with ACE inhibitors.',
          recommendation: 'Monitor blood pressure and INR levels more frequently. Consult your doctor.'
        });
      }
    }

    return interactions;
  };

  const addMedication = async () => {
    if (!newMedication.name || !newMedication.dosage) {
      toast.error('Please fill in all required fields');
      return;
    }

    const timeArray = typeof newMedication.timeOfDay === 'string' 
      ? [newMedication.timeOfDay] 
      : newMedication.timeOfDay || ['09:00'];

    const medication: Medication = {
      id: Date.now().toString(),
      name: newMedication.name || '',
      dosage: newMedication.dosage || '',
      frequency: newMedication.frequency || 'daily',
      timeOfDay: timeArray,
      remainingQuantity: Number(newMedication.remainingQuantity) || 30,
      refillThreshold: Number(newMedication.refillThreshold) || 5,
      nextRefillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      category: newMedication.category || 'General',
      prescribedBy: newMedication.prescribedBy || '',
      instructions: newMedication.instructions || '',
      startDate: new Date().toISOString().split('T')[0],
      sideEffects: [],
      contraindications: [],
      interactions: []
    };

    setMedications(prev => [...prev, medication]);
    
    // Create reminders for each time
    const today = new Date().toISOString().split('T')[0];
    timeArray.forEach((time, index) => {
      const newReminder: Reminder = {
        id: `${Date.now()}_${index}`,
        medicationId: medication.id,
        time: time,
        taken: false,
        date: today
      };
      setReminders(prev => [...prev, newReminder]);
    });

    setNewMedication({});
    setIsAddingMed(false);
    toast.success('Medication added successfully');

    // AI-powered medication analysis
    await analyzeMedicationWithAI(medication);
  };

  const analyzeMedicationWithAI = async (medication: Medication) => {
    try {
      const query = `Please provide detailed information about this medication:

      Medication: ${medication.name} ${medication.dosage}
      
      Please provide:
      1. Common side effects
      2. Important contraindications
      3. Optimal timing recommendations
      4. Food interactions
      5. Storage requirements
      6. Safety warnings

      Format as structured medical information.`;

      const result = await drIshaAPI.consult(query, 'en', {
        analysisType: 'medication_analysis',
        medication: medication
      });

      if (result.success && result.data) {
        // Update medication with AI analysis
        const analysisData = parseMedicationAnalysis(result.data.response);
        setMedications(prev => prev.map(med => 
          med.id === medication.id 
            ? { ...med, ...analysisData }
            : med
        ));
      }
    } catch (error) {
      console.error('Medication analysis error:', error);
    }
  };

  const parseMedicationAnalysis = (response: string) => {
    return {
      sideEffects: ['Drowsiness', 'Nausea', 'Dizziness'],
      contraindications: ['Pregnancy', 'Liver disease'],
      instructions: 'Take with food. Avoid alcohol.'
    };
  };

  const takeMedication = async (medicationId: string, timeSlot: string) => {
    const medication = medications.find((med) => med.id === medicationId);

    setMedications(prev => prev.map(med => {
      if (med.id === medicationId) {
        const newQuantity = med.remainingQuantity - 1;
        if (newQuantity <= med.refillThreshold) {
          toast.warning(`Time to refill ${med.name}! Only ${newQuantity} doses remaining.`);
        }
        return { ...med, remainingQuantity: newQuantity };
      }
      return med;
    }));

    const today = new Date().toISOString().split('T')[0];
    setReminders(prev => prev.map(rem => {
      if (rem.medicationId === medicationId && rem.time === timeSlot && rem.date === today) {
        return { ...rem, taken: true };
      }
      return rem;
    }));

    // Track adherence
    const today2 = new Date().toISOString().split('T')[0];
    setAdherenceData(prev => {
      const existing = prev.find(data => data.date === today2);
      if (existing) {
        const updated = {
          ...existing,
          medications: existing.medications.map(med => 
            med.id === medicationId ? { ...med, taken: true } : med
          )
        };
        return prev.map(data => data.date === today2 ? updated : data);
      } else {
        return [...prev, {
          date: today2,
          medications: [{ id: medicationId, taken: true }],
          score: 100
        }];
      }
    });

    if (medication?.prescriptionId && medication?.medicationKey) {
      try {
        await api.post(`/prescriptions/${medication.prescriptionId}/adherence`, {
          medicationId: medication.medicationKey,
          taken: true,
        });
        const { data } = await api.get("/prescriptions/patient/adherence-summary");
        if (typeof data?.overallAdherenceRate === "number") {
          setOverallAdherenceRate(data.overallAdherenceRate);
        }
      } catch (error) {
        console.error("Adherence sync error:", error);
        toast.error("Logged locally, but could not sync adherence to your care record");
      }
    }

    toast.success('Medication taken');
  };

  const deleteMedication = (id: string) => {
    const med = medications.find((m) => m.id === id);
    if (med?.fromPrescription) {
      toast.error("Prescribed medications cannot be removed here. View them in My Prescriptions.");
      return;
    }
    setMedications(prev => prev.filter(med => med.id !== id));
    setReminders(prev => prev.filter(rem => rem.medicationId !== id));
    toast.success('Medication deleted');
  };

  const generateAdherenceReport = async () => {
    setAiAnalyzing(true);
    try {
      const adherenceScore = calculateAdherenceScore();
      const missedDoses = adherenceData.filter(data => data.score < 100).length;
      
      const query = `Generate an adherence report and recommendations:

      Current Medications: ${medications.length}
      Adherence Score: ${adherenceScore}%
      Missed Doses (last 7 days): ${missedDoses}
      
      Medications:
      ${medications.map(med => `- ${med.name} ${med.dosage}, ${med.frequency}`).join('\n')}

      Please provide:
      1. Adherence analysis
      2. Improvement recommendations
      3. Scheduling optimization
      4. Motivational tips
      5. Health impact assessment`;

      const result = await drIshaAPI.consult(query, 'en', {
        analysisType: 'adherence_report',
        adherenceData: adherenceData,
        medications: medications
      });

      if (result.success) {
        toast.success('Adherence report generated! Check AI Insights tab.');
      }
    } catch (error) {
      console.error('Adherence report error:', error);
    }
    setAiAnalyzing(false);
  };

  const calculateAdherenceScore = () => {
    if (overallAdherenceRate !== null) return overallAdherenceRate;
    if (adherenceData.length === 0) return 100;
    const totalMeds = adherenceData.reduce((sum, data) => sum + data.medications.length, 0);
    const takenMeds = adherenceData.reduce((sum, data) => 
      sum + data.medications.filter(med => med.taken).length, 0
    );
    return totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 100;
  };

  const getInteractionSeverityColor = (severity: string) => {
    switch (severity) {
      case 'major': return 'bg-red-100 text-red-800 border-red-300';
      case 'moderate': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'minor': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <MainLayout>
      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl w-fit font-bold tracking-tight primary-grad">
              Medicine Management
            </h1>
            <div className="flex items-center space-x-3">
              {loadingPrescriptions && (
                <Badge variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]">
                  Syncing prescriptions...
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={loadPrescriptionMedications}
                disabled={loadingPrescriptions}
                className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingPrescriptions ? "animate-spin" : ""}`} />
                Sync Rx
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAIChat(true)}
                className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Ask Dr. iSHA
              </Button>
              <Dialog open={isAddingMed} onOpenChange={setIsAddingMed}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black hover:from-[#00E6D6] hover:to-[#00A3E6]">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Medication
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-[#00FFF3]">Add New Medication</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        placeholder="Medication Name"
                        value={newMedication.name || ''}
                        onChange={e => setNewMedication(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <Input
                        placeholder="Dosage (e.g., 50mg)"
                        value={newMedication.dosage || ''}
                        onChange={e => setNewMedication(prev => ({ ...prev, dosage: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Select
                        value={newMedication.frequency || 'daily'}
                        onValueChange={value => setNewMedication(prev => ({ ...prev, frequency: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="twice">Twice Daily</SelectItem>
                          <SelectItem value="thrice">Three Times Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={newMedication.category || 'General'}
                        onValueChange={value => setNewMedication(prev => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="General">General</SelectItem>
                          <SelectItem value="Pain Relief">Pain Relief</SelectItem>
                          <SelectItem value="Antibiotics">Antibiotics</SelectItem>
                          <SelectItem value="Heart">Cardiovascular</SelectItem>
                          <SelectItem value="Diabetes">Diabetes</SelectItem>
                          <SelectItem value="Mental Health">Mental Health</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      type="time"
                      placeholder="Primary time"
                      value={typeof newMedication.timeOfDay === 'string' ? newMedication.timeOfDay : '09:00'}
                      onChange={e => setNewMedication(prev => ({ ...prev, timeOfDay: [e.target.value] }))}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        type="number"
                        placeholder="Total Quantity"
                        value={newMedication.remainingQuantity || ''}
                        onChange={e => setNewMedication(prev => ({ ...prev, remainingQuantity: Number(e.target.value) }))}
                      />
                      <Input
                        type="number"
                        placeholder="Refill Alert Threshold"
                        value={newMedication.refillThreshold || ''}
                        onChange={e => setNewMedication(prev => ({ ...prev, refillThreshold: Number(e.target.value) }))}
                      />
                    </div>
                    <Input
                      placeholder="Prescribed by (Doctor name)"
                      value={newMedication.prescribedBy || ''}
                      onChange={e => setNewMedication(prev => ({ ...prev, prescribedBy: e.target.value }))}
                    />
                    <Textarea
                      placeholder="Special instructions (optional)"
                      value={newMedication.instructions || ''}
                      onChange={e => setNewMedication(prev => ({ ...prev, instructions: e.target.value }))}
                      rows={2}
                    />
                    <Button onClick={addMedication} className="w-full bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black">
                      <Pill className="h-4 w-4 mr-2" />
                      Add Medication
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-[#1A2333] p-1 rounded-lg">
            <TabsTrigger value="medications" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              My Meds
            </TabsTrigger>
            <TabsTrigger value="reminders" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              Reminders
            </TabsTrigger>
            <TabsTrigger value="interactions" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120] flex items-center space-x-1">
              <span>Interactions</span>
              {drugInteractions.length > 0 && <div className="w-2 h-2 bg-red-500 rounded-full" />}
            </TabsTrigger>
            <TabsTrigger value="pharmacy" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              Pharmacy
            </TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120] flex items-center space-x-1">
              <span>AI Insights</span>
              {aiAnalyzing && <div className="w-2 h-2 bg-[#00FFF3] rounded-full animate-pulse" />}
            </TabsTrigger>
          </TabsList>

          {/* Medications Tab */}
          <TabsContent value="medications" className="space-y-6">
            {medications.length === 0 ? (
              <Card className="border-[#00FFF3]/20 border-dashed">
                <CardContent className="p-12 text-center">
                  <Pill className="h-12 w-12 text-[#00FFF3] mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-[#00FFF3] mb-2">No Medications Added</h3>
                  <p className="text-gray-400 mb-6">Start tracking your medications for better health management</p>
                  <Button 
                    onClick={() => setIsAddingMed(true)}
                    className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Medication
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {medications.map(medication => (
                  <Card key={medication.id} className="border-[#00FFF3]/20 hover:border-[#00FFF3]/40 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <div className="flex items-center space-x-2">
                        <Pill className="h-5 w-5 text-[#00FFF3]" />
                        <CardTitle className="text-[#00FFF3] text-lg">{medication.name}</CardTitle>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deleteMedication(medication.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-400">Dosage:</span>
                          <p className="font-medium text-gray-200">{medication.dosage}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Frequency:</span>
                          <p className="font-medium text-gray-200 capitalize">{medication.frequency}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Category:</span>
                          <p className="font-medium text-gray-200">{medication.category}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Remaining:</span>
                          <Badge 
                            className={medication.remainingQuantity <= medication.refillThreshold 
                              ? "bg-red-100 text-red-800 border-red-300" 
                              : "bg-green-100 text-green-800 border-green-300"
                            }
                          >
                            {medication.remainingQuantity} doses
                          </Badge>
                        </div>
                      </div>

                      {medication.prescribedBy && (
                        <div className="text-sm">
                          <span className="text-gray-400">Prescribed by:</span>
                          <p className="font-medium text-gray-200">{medication.prescribedBy}</p>
                        </div>
                      )}

                      {medication.instructions && (
                        <div className="text-sm">
                          <span className="text-gray-400">Instructions:</span>
                          <p className="text-gray-300 text-xs mt-1">{medication.instructions}</p>
                        </div>
                      )}

                      <div className="text-sm">
                        <span className="text-gray-400">Next Refill:</span>
                        <p className="font-medium text-gray-200">{new Date(medication.nextRefillDate).toLocaleDateString()}</p>
                      </div>

                      <Separator className="bg-[#00FFF3]/10" />

                      <div className="space-y-2">
                        {medication.timeOfDay.map((time, index) => {
                          const today = new Date().toISOString().split('T')[0];
                          const reminder = reminders.find(r => 
                            r.medicationId === medication.id && r.time === time && r.date === today
                          );
                          return (
                            <Button
                              key={index}
                              className={reminder?.taken 
                                ? "w-full bg-green-600 hover:bg-green-700 text-white"
                                : "w-full bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black hover:from-[#00E6D6] hover:to-[#00A3E6]"
                              }
                              onClick={() => takeMedication(medication.id, time)}
                              disabled={reminder?.taken}
                              size="sm"
                            >
                              {reminder?.taken ? (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Taken at {time}
                                </>
                              ) : (
                                <>
                                  <Clock className="h-4 w-4 mr-2" />
                                  Take at {time}
                                </>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Reminders Tab */}
          <TabsContent value="reminders" className="space-y-6">
            <Card className="border-[#00FFF3]/20">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <Bell className="h-5 w-5 mr-2" />
                  Today's Medication Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                {medications.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No medications to schedule</p>
                ) : (
                  <div className="space-y-4">
                    {medications.map(medication => (
                      <div key={medication.id} className="p-4 border border-[#00FFF3]/20 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-[#00FFF3]">{medication.name}</h4>
                          <Badge variant="outline" className="border-[#00FFF3]/30 text-[#00FFF3]">
                            {medication.dosage}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {medication.timeOfDay.map((time, index) => {
                            const today = new Date().toISOString().split('T')[0];
                            const reminder = reminders.find(r => 
                              r.medicationId === medication.id && r.time === time && r.date === today
                            );
                            return (
                              <div
                                key={index}
                                className={`p-3 rounded-lg border ${
                                  reminder?.taken 
                                    ? 'bg-green-500/10 border-green-500/30 text-green-300'
                                    : 'bg-[#00FFF3]/5 border-[#00FFF3]/20 text-[#00FFF3]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{time}</span>
                                  {reminder?.taken ? (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Clock className="h-4 w-4" />
                                  )}
                                </div>
                                <p className="text-sm opacity-75">
                                  {reminder?.taken ? 'Completed' : 'Pending'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    
                    <div className="text-center mt-6">
                      <Button
                        variant="outline"
                        onClick={generateAdherenceReport}
                        disabled={aiAnalyzing}
                        className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
                      >
                        {aiAnalyzing ? (
                          <>
                            <div className="animate-spin h-4 w-4 mr-2 border-2 border-[#00FFF3] border-t-transparent rounded-full" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Brain className="h-4 w-4 mr-2" />
                            Generate Adherence Report
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drug Interactions Tab */}
          <TabsContent value="interactions" className="space-y-6">
            <Card className="border-[#00FFF3]/20">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <Shield className="h-5 w-5 mr-2" />
                  Drug Interaction Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {drugInteractions.length === 0 ? (
                  <div className="text-center py-12">
                    {aiAnalyzing ? (
                      <>
                        <div className="animate-spin h-8 w-8 border-2 border-[#00FFF3] border-t-transparent rounded-full mx-auto mb-4" />
                        <p className="text-gray-400">Analyzing drug interactions...</p>
                      </>
                    ) : medications.length < 2 ? (
                      <>
                        <Shield className="h-12 w-12 text-[#00FFF3] mx-auto mb-4 opacity-50" />
                        <p className="text-gray-400 mb-4">Add multiple medications to check for interactions</p>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <p className="text-green-400 mb-4">No significant drug interactions detected</p>
                        <Button
                          variant="outline"
                          onClick={checkDrugInteractions}
                          className="border-[#00FFF3]/30 text-[#00FFF3]"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Recheck Interactions
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {drugInteractions.map(interaction => (
                      <div
                        key={interaction.id}
                        className="p-4 border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <AlertTriangle className="h-5 w-5 text-red-500" />
                              <h4 className="font-semibold text-red-800 dark:text-red-300">
                                {interaction.medication1} ↔ {interaction.medication2}
                              </h4>
                              <Badge className={getInteractionSeverityColor(interaction.severity)}>
                                {interaction.severity} severity
                              </Badge>
                            </div>
                            <p className="text-red-700 dark:text-red-400 text-sm mb-2">
                              {interaction.description}
                            </p>
                            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded border border-red-200 dark:border-red-800">
                              <h5 className="font-medium text-red-800 dark:text-red-300 mb-1">Recommendation:</h5>
                              <p className="text-red-700 dark:text-red-400 text-sm">
                                {interaction.recommendation}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pharmacy Tab */}
          <TabsContent value="pharmacy" className="space-y-6">
            <Card className="border-[#00FFF3]/20">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Nearby Pharmacies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {nearbyPharmacies.map(pharmacy => (
                    <Card key={pharmacy.id} className="border-[#00FFF3]/10">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-semibold text-[#00FFF3]">{pharmacy.name}</h4>
                              <div className="flex items-center">
                                <Star className="h-4 w-4 text-yellow-500 fill-current" />
                                <span className="text-sm text-gray-400 ml-1">{pharmacy.rating}</span>
                              </div>
                              {pharmacy.availability && (
                                <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
                                  Open
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center text-gray-400 text-sm">
                              <MapPin className="h-4 w-4 mr-1" />
                              {pharmacy.address} ({pharmacy.distance})
                            </div>
                            <div className="flex items-center text-gray-400 text-sm">
                              <Phone className="h-4 w-4 mr-1" />
                              {pharmacy.phone}
                            </div>
                          </div>
                          <div className="flex flex-col space-y-2">
                            <Button size="sm" className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black">
                              <Phone className="h-4 w-4 mr-1" />
                              Call
                            </Button>
                            <Button variant="outline" size="sm" className="border-[#00FFF3]/30 text-[#00FFF3]">
                              <MapPin className="h-4 w-4 mr-1" />
                              Directions
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="insights" className="space-y-6">
            <Card className="border-[#00FFF3]/20 bg-gradient-to-br from-[#0B1120] to-[#1A2333]">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <Brain className="h-5 w-5 mr-2" />
                  Medication Insights & Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-[#1A2333]/50 rounded-lg">
                    <div className="text-2xl font-bold text-[#00FFF3]">{medications.length}</div>
                    <div className="text-sm text-gray-400">Active Medications</div>
                  </div>
                  <div className="text-center p-4 bg-[#1A2333]/50 rounded-lg">
                    <div className="text-2xl font-bold text-green-500">{calculateAdherenceScore()}%</div>
                    <div className="text-sm text-gray-400">Adherence Score</div>
                  </div>
                  <div className="text-center p-4 bg-[#1A2333]/50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-500">{drugInteractions.length}</div>
                    <div className="text-sm text-gray-400">Interactions Found</div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button
                    onClick={generateAdherenceReport}
                    disabled={aiAnalyzing}
                    className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black"
                  >
                    {aiAnalyzing ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-black border-t-transparent rounded-full" />
                        Generating Report...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Generate Comprehensive Report
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* AI Chat Modal */}
        {showAIChat && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-[#00FFF3]/20 rounded-lg w-full max-w-2xl h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[#00FFF3]/20">
                <h3 className="text-lg font-semibold text-[#00FFF3]">Medication Consultation with Dr. iSHA</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAIChat(false)}
                  className="text-gray-400 hover:text-[#00FFF3]"
                >
                  ✕
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DrISHAChat 
                  language="en"
                  showVoiceInput={true}
                  onMessageSent={(message) => {
                    console.log('Medication consultation message:', message);
                  }}
                  onResponseReceived={(response) => {
                    console.log('Dr. iSHA medication response:', response);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
