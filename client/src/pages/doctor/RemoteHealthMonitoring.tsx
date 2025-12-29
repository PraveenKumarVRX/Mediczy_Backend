import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Legend,
  ZAxis,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  Activity,
  Heart,
  Thermometer,
  Droplets,
  Wind,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Filter,
  Users,
  Bell,
  BellOff,
  Maximize2,
  Minimize2,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Phone,
  Video,
  MessageSquare,
  FileText,
  Clock,
  MapPin,
  User,
  Zap,
  Volume2,
  VolumeX,
  Settings,
  ChevronRight,
  ExternalLink,
  Search,
  X,
  BedDouble,
  Siren,
  Ambulance,
  Stethoscope,
  Pill,
  Clipboard,
  Timer,
  Radio,
  Shield,
  AlertOctagon,
  Waves,
  MonitorSpeaker,
  Wifi,
  WifiOff,
  Printer,
  Download,
  MoreVertical,
  Plus,
  PhoneCall,
  UserCheck,
  ClipboardList,
  Brain,
  HeartPulse,
  Gauge,
  Bed,
  Layers,
  LayoutGrid,
  List,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  BarChart3,
  PieChart,
  Banknote,
  type LucideIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ==========================================
// TYPE DEFINITIONS
// ==========================================

type DashboardMode = 'remote' | 'er' | 'icu';

interface VitalSigns {
  heartRate: number;
  bloodPressure: { systolic: number; diastolic: number };
  oxygenSaturation: number;
  temperature: number;
  respiratoryRate: number;
  // ICU-specific
  map?: number; // Mean Arterial Pressure
  cvp?: number; // Central Venous Pressure
  etCO2?: number; // End-tidal CO2
  gcs?: number; // Glasgow Coma Scale
  // Calculated scores
  newsScore?: number; // National Early Warning Score
  mewsScore?: number; // Modified Early Warning Score
}

interface VentilatorSettings {
  mode: 'SIMV' | 'AC' | 'PS' | 'CPAP' | 'BiPAP' | 'OFF';
  fio2: number;
  peep: number;
  tidalVolume: number;
  rr: number;
  pip?: number; // Peak Inspiratory Pressure
}

interface InfusionPump {
  drug: string;
  rate: number;
  unit: string;
  remaining: number; // minutes
  status: 'running' | 'paused' | 'alarm' | 'empty';
}

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bedNumber: string;
  admissionTime: string;
  chiefComplaint: string;
  riskScore: number;
  status: 'critical' | 'warning' | 'stable';
  vitalSigns: VitalSigns;
  trend: 'improving' | 'stable' | 'declining';
  alerts: string[];
  lastUpdated: Date;
  location: string;
  assignedDoctor?: string;
  assignedNurse?: string;
  notes?: string;
  // ER specific
  triageCategory?: 1 | 2 | 3 | 4 | 5; // 1=Resuscitation, 5=Non-urgent
  waitTime?: number; // minutes
  arrivalMode?: 'ambulance' | 'walk-in' | 'transfer' | 'police';
  // ICU specific
  ventilator?: VentilatorSettings;
  infusions?: InfusionPump[];
  isolation?: 'none' | 'contact' | 'droplet' | 'airborne';
  dayInICU?: number;
  dialysis?: boolean;
  // Remote monitoring
  deviceType?: 'wearable' | 'home-monitor' | 'implant' | 'mobile-app';
  connectivity?: 'online' | 'offline' | 'intermittent';
  lastSync?: Date;
}

interface ICUBed {
  id: string;
  number: string;
  type: 'standard' | 'isolation' | 'trauma' | 'cardiac';
  status: 'occupied' | 'available' | 'cleaning' | 'maintenance';
  patient?: Patient;
  equipment: {
    ventilator: boolean;
    monitor: boolean;
    dialysis: boolean;
    ecmo: boolean;
  };
}

interface TriagePatient extends Patient {
  triageTime: Date;
  estimatedWait: number;
  seenBy?: string;
}

interface AmbulanceIncoming {
  id: string;
  eta: number; // minutes
  patientCondition: string;
  category: 'red' | 'yellow' | 'green';
  source: string;
  paramedic: string;
  vitals?: Partial<VitalSigns>;
}

interface ShiftHandover {
  id: string;
  patientId: string;
  patientName: string;
  fromDoctor: string;
  toDoctor: string;
  summary: string;
  pendingTasks: string[];
  timestamp: Date;
  acknowledged: boolean;
}

interface ResourceStatus {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  ventilators: { total: number; inUse: number };
  dialysisMachines: { total: number; inUse: number };
  monitors: { total: number; inUse: number };
  isolation: { total: number; inUse: number };
  staff: { doctors: number; nurses: number; techs: number };
}

interface DashboardStats {
  total: number;
  critical: number;
  warning: number;
  stable: number;
  avgRiskScore: number;
  // ER stats
  avgWaitTime?: number;
  triageQueue?: number;
  ambulanceIncoming?: number;
  // ICU stats
  ventilated?: number;
  newsAbove5?: number;
  newAdmissions?: number;
}

interface AlertEvent {
  id: string;
  patientId: string;
  patientName: string;
  type: 'critical' | 'warning' | 'info' | 'code-blue' | 'code-red';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  priority: 1 | 2 | 3;
}

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

const RISK_THRESHOLDS = {
  CRITICAL: 70,  // >= 70 is critical (red)
  WARNING: 40,   // >= 40 is warning (amber)
  STABLE: 0      // < 40 is stable (green)
};

const STATUS_COLORS = {
  critical: '#ef4444', // Red
  warning: '#f59e0b',  // Amber
  stable: '#22c55e'    // Green
};

// Color-blind friendly alternatives
const STATUS_COLORS_ACCESSIBLE = {
  critical: '#d62728', // Red (distinguishable)
  warning: '#ff7f0e',  // Orange
  stable: '#2ca02c'    // Green (blue-tinted)
};

const STATUS_PATTERNS = {
  critical: '▲',  // Triangle
  warning: '◆',   // Diamond
  stable: '●'     // Circle
};

const TRIAGE_COLORS = {
  1: { bg: 'bg-red-600', text: 'text-white', label: 'Resuscitation', color: '#dc2626' },
  2: { bg: 'bg-orange-500', text: 'text-white', label: 'Emergency', color: '#f97316' },
  3: { bg: 'bg-yellow-500', text: 'text-black', label: 'Urgent', color: '#eab308' },
  4: { bg: 'bg-green-500', text: 'text-white', label: 'Semi-Urgent', color: '#22c55e' },
  5: { bg: 'bg-blue-500', text: 'text-white', label: 'Non-Urgent', color: '#3b82f6' }
};

const INDIAN_NAMES = [
  'Rajesh Kumar', 'Priya Sharma', 'Amit Patel', 'Sunita Devi', 'Vikram Singh',
  'Anjali Gupta', 'Mohammed Khan', 'Lakshmi Iyer', 'Suresh Reddy', 'Kavitha Nair',
  'Rahul Verma', 'Deepa Menon', 'Arun Pillai', 'Meera Krishnan', 'Sanjay Joshi',
  'Pooja Agarwal', 'Ramesh Babu', 'Neha Kapoor', 'Vinod Thakur', 'Geeta Rani',
  'Ashok Mehta', 'Ritu Singh', 'Manoj Das', 'Shanti Devi', 'Sunil Yadav'
];

// ==========================================
// NEWS/MEWS SCORE CALCULATOR
// ==========================================

const calculateNEWS = (vitals: VitalSigns): number => {
  let score = 0;
  
  // Respiratory rate
  if (vitals.respiratoryRate <= 8) score += 3;
  else if (vitals.respiratoryRate >= 25) score += 3;
  else if (vitals.respiratoryRate >= 21) score += 2;
  else if (vitals.respiratoryRate >= 9 && vitals.respiratoryRate <= 11) score += 1;
  
  // SpO2
  if (vitals.oxygenSaturation <= 91) score += 3;
  else if (vitals.oxygenSaturation <= 93) score += 2;
  else if (vitals.oxygenSaturation <= 95) score += 1;
  
  // Systolic BP
  if (vitals.bloodPressure.systolic <= 90 || vitals.bloodPressure.systolic >= 220) score += 3;
  else if (vitals.bloodPressure.systolic <= 100 || vitals.bloodPressure.systolic >= 200) score += 2;
  else if (vitals.bloodPressure.systolic <= 110) score += 1;
  
  // Heart rate
  if (vitals.heartRate <= 40 || vitals.heartRate >= 131) score += 3;
  else if (vitals.heartRate >= 111) score += 2;
  else if (vitals.heartRate <= 50 || vitals.heartRate >= 91) score += 1;
  
  // Temperature
  if (vitals.temperature <= 35) score += 3;
  else if (vitals.temperature >= 39.1) score += 2;
  else if (vitals.temperature <= 36 || vitals.temperature >= 38.1) score += 1;
  
  return score;
};

// ==========================================
// ECG WAVEFORM GENERATOR
// ==========================================

const generateECGData = (heartRate: number, samples: number = 100): { x: number; y: number }[] => {
  const data: { x: number; y: number }[] = [];
  const rrInterval = 60 / heartRate; // seconds per beat
  const samplesPerBeat = Math.floor(samples / 3);
  
  for (let i = 0; i < samples; i++) {
    const beatPhase = (i % samplesPerBeat) / samplesPerBeat;
    let y = 0;
    
    // P wave (0-0.1)
    if (beatPhase < 0.08) {
      y = 0.15 * Math.sin(beatPhase * Math.PI / 0.08);
    }
    // PR segment (0.08-0.12)
    else if (beatPhase < 0.12) {
      y = 0;
    }
    // QRS complex (0.12-0.20)
    else if (beatPhase < 0.14) {
      y = -0.1 * Math.sin((beatPhase - 0.12) * Math.PI / 0.02);
    }
    else if (beatPhase < 0.17) {
      y = 1.0 * Math.sin((beatPhase - 0.14) * Math.PI / 0.03);
    }
    else if (beatPhase < 0.20) {
      y = -0.2 * Math.sin((beatPhase - 0.17) * Math.PI / 0.03);
    }
    // ST segment (0.20-0.30)
    else if (beatPhase < 0.30) {
      y = 0;
    }
    // T wave (0.30-0.45)
    else if (beatPhase < 0.45) {
      y = 0.25 * Math.sin((beatPhase - 0.30) * Math.PI / 0.15);
    }
    // Baseline (0.45-1.0)
    else {
      y = 0;
    }
    
    // Add some noise
    y += (Math.random() - 0.5) * 0.02;
    
    data.push({ x: i, y });
  }
  
  return data;
};

// ==========================================
// MOCK DATA GENERATOR
// ==========================================

const generateMockPatients = (count: number, mode: DashboardMode = 'remote'): Patient[] => {
  const erComplaints = [
    'Chest Pain', 'SOB - Acute', 'Abdominal Pain', 'Head Injury', 'RTA - Polytrauma',
    'Fever with Altered Sensorium', 'Snake Bite', 'Poisoning', 'Burns 30% TBSA',
    'Stroke - Acute Onset', 'MI - STEMI', 'Diabetic Ketoacidosis', 'Status Epilepticus',
    'Anaphylaxis', 'GI Bleed', 'Acute Kidney Injury', 'Hanging - Near Fatal'
  ];
  
  const icuDiagnoses = [
    'Septic Shock - Pneumonia', 'ARDS', 'Post CABG Day 2', 'Severe Pancreatitis',
    'Hepatic Encephalopathy', 'Status Asthmaticus', 'Guillain-Barré Syndrome',
    'Myasthenic Crisis', 'Post Craniotomy', 'Poly-trauma - Post Op', 'COPD Exacerbation',
    'Cardiogenic Shock', 'DKA - Resolving', 'Acute Liver Failure', 'Meningitis'
  ];
  
  const remoteConditions = [
    'Post-MI Follow-up', 'CHF Monitoring', 'Arrhythmia Surveillance', 'Hypertension',
    'Diabetes - Insulin Dependent', 'COPD - Home O2', 'Post Pacemaker', 'Post Stent',
    'CKD Stage 4', 'Post Transplant', 'Heart Failure - LVEF 30%', 'Atrial Fibrillation'
  ];
  
  const erLocations = ['Resuscitation Bay', 'Trauma Bay', 'Red Zone', 'Yellow Zone', 'Green Zone', 'Observation', 'Procedure Room'];
  const icuLocations = ['ICU Bed', 'CCU Bed', 'SICU Bed', 'Neuro ICU', 'MICU Bed', 'Cardiac ICU', 'Isolation ICU'];
  const remoteLocations = ['Home', 'Nursing Home', 'Sub-center', 'PHC', 'Mobile'];
  
  const doctors = ['Dr. Sharma', 'Dr. Patel', 'Dr. Reddy', 'Dr. Singh', 'Dr. Khan', 'Dr. Iyer', 'Dr. Das'];
  const nurses = ['Sr. Mary', 'Sr. Lakshmi', 'Sr. Fatima', 'Sr. Priya', 'Sr. Geeta', 'Br. Rajan', 'Br. Sunil'];
  
  const complaints = mode === 'er' ? erComplaints : mode === 'icu' ? icuDiagnoses : remoteConditions;
  const locations = mode === 'er' ? erLocations : mode === 'icu' ? icuLocations : remoteLocations;
  
  const patients: Patient[] = [];
  
  for (let i = 1; i <= count; i++) {
    const age = Math.floor(Math.random() * 85) + 10;
    const riskScore = Math.floor(Math.random() * 100);
    
    let status: Patient['status'] = 'stable';
    if (riskScore >= RISK_THRESHOLDS.CRITICAL) status = 'critical';
    else if (riskScore >= RISK_THRESHOLDS.WARNING) status = 'warning';
    
    const heartRate = status === 'critical' 
      ? Math.floor(Math.random() * 60) + 100
      : status === 'warning'
        ? Math.floor(Math.random() * 30) + 80
        : Math.floor(Math.random() * 20) + 60;
    
    const oxygenSat = status === 'critical'
      ? Math.floor(Math.random() * 10) + 85
      : status === 'warning'
        ? Math.floor(Math.random() * 5) + 92
        : Math.floor(Math.random() * 3) + 96;
        
    const respRate = status === 'critical'
      ? Math.floor(Math.random() * 15) + 22
      : status === 'warning'
        ? Math.floor(Math.random() * 8) + 18
        : Math.floor(Math.random() * 6) + 12;
    
    const temp = status === 'critical'
      ? parseFloat((37 + Math.random() * 3).toFixed(1))
      : parseFloat((36.5 + Math.random() * 1.5).toFixed(1));
    
    const systolic = status === 'critical'
      ? Math.random() > 0.5 ? Math.floor(Math.random() * 30) + 70 : Math.floor(Math.random() * 40) + 170
      : Math.floor(Math.random() * 40) + 110;
    
    const vitalSigns: VitalSigns = {
      heartRate,
      bloodPressure: {
        systolic,
        diastolic: Math.floor(systolic * 0.6) + Math.floor(Math.random() * 10)
      },
      oxygenSaturation: oxygenSat,
      temperature: temp,
      respiratoryRate: respRate,
      map: Math.floor((systolic + 2 * (systolic * 0.6)) / 3),
      gcs: status === 'critical' ? Math.floor(Math.random() * 7) + 3 : status === 'warning' ? Math.floor(Math.random() * 4) + 10 : 15,
      etCO2: Math.floor(Math.random() * 15) + 30,
      cvp: Math.floor(Math.random() * 10) + 5
    };
    
    vitalSigns.newsScore = calculateNEWS(vitalSigns);
    
    const location = locations[Math.floor(Math.random() * locations.length)];
    const bedNum = mode === 'remote' ? '' : `-${Math.floor(Math.random() * 20) + 1}`;
    
    const patient: Patient = {
      id: `P${i.toString().padStart(4, '0')}`,
      name: INDIAN_NAMES[Math.floor(Math.random() * INDIAN_NAMES.length)],
      age,
      gender: ['Male', 'Female'][Math.floor(Math.random() * 2)] as Patient['gender'],
      bedNumber: `${location}${bedNum}`,
      admissionTime: new Date(Date.now() - Math.random() * 48 * 60 * 60 * 1000).toISOString(),
      chiefComplaint: complaints[Math.floor(Math.random() * complaints.length)],
      riskScore,
      status,
      vitalSigns,
      trend: ['improving', 'stable', 'declining'][Math.floor(Math.random() * 3)] as Patient['trend'],
      alerts: status === 'critical' 
        ? ['⚠️ Critical vitals', '🚨 Immediate attention required']
        : status === 'warning'
          ? ['📉 Vitals trending down']
          : [],
      lastUpdated: new Date(),
      location,
      assignedDoctor: doctors[Math.floor(Math.random() * doctors.length)],
      assignedNurse: nurses[Math.floor(Math.random() * nurses.length)]
    };
    
    // Add mode-specific properties
    if (mode === 'er') {
      patient.triageCategory = (Math.floor(Math.random() * 5) + 1) as 1 | 2 | 3 | 4 | 5;
      patient.waitTime = Math.floor(Math.random() * 180);
      patient.arrivalMode = ['ambulance', 'walk-in', 'transfer', 'police'][Math.floor(Math.random() * 4)] as Patient['arrivalMode'];
    }
    
    if (mode === 'icu') {
      patient.dayInICU = Math.floor(Math.random() * 14) + 1;
      patient.isolation = ['none', 'contact', 'droplet', 'airborne'][Math.floor(Math.random() * 4)] as Patient['isolation'];
      patient.dialysis = Math.random() > 0.7;
      
      // Add ventilator for critical/warning patients
      if (status === 'critical' || (status === 'warning' && Math.random() > 0.5)) {
        patient.ventilator = {
          mode: ['SIMV', 'AC', 'PS', 'CPAP', 'BiPAP'][Math.floor(Math.random() * 5)] as VentilatorSettings['mode'],
          fio2: Math.floor(Math.random() * 60) + 40,
          peep: Math.floor(Math.random() * 10) + 5,
          tidalVolume: Math.floor(Math.random() * 200) + 400,
          rr: Math.floor(Math.random() * 10) + 12,
          pip: Math.floor(Math.random() * 15) + 15
        };
      }
      
      // Add infusions
      patient.infusions = [];
      if (status === 'critical') {
        const drugs = ['Noradrenaline', 'Dopamine', 'Dobutamine', 'Vasopressin', 'Midazolam', 'Fentanyl', 'Propofol', 'Insulin'];
        const numInfusions = Math.floor(Math.random() * 4) + 1;
        for (let j = 0; j < numInfusions; j++) {
          patient.infusions.push({
            drug: drugs[Math.floor(Math.random() * drugs.length)],
            rate: parseFloat((Math.random() * 10 + 0.5).toFixed(1)),
            unit: 'mcg/kg/min',
            remaining: Math.floor(Math.random() * 360) + 30,
            status: Math.random() > 0.9 ? 'alarm' : 'running'
          });
        }
      }
    }
    
    if (mode === 'remote') {
      patient.deviceType = ['wearable', 'home-monitor', 'implant', 'mobile-app'][Math.floor(Math.random() * 4)] as Patient['deviceType'];
      patient.connectivity = Math.random() > 0.1 ? 'online' : Math.random() > 0.5 ? 'offline' : 'intermittent';
      patient.lastSync = new Date(Date.now() - Math.random() * 60 * 60 * 1000);
    }
    
    patients.push(patient);
  }
  
  return patients;
};

// Generate incoming ambulances
const generateAmbulances = (count: number): AmbulanceIncoming[] => {
  const conditions = [
    'RTA - Head Injury', 'Chest Pain - ?MI', 'Burns 40%', 'Drowning', 'Snake Bite',
    'Fall from Height', 'Assault - Stab Wound', 'Seizures', 'Unconscious', 'Labour - Complicated'
  ];
  const sources = ['Accident Site', 'PHC Transfer', 'Home Call', 'Industrial Injury', 'Railway Accident'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `AMB-${i + 1}`,
    eta: Math.floor(Math.random() * 30) + 2,
    patientCondition: conditions[Math.floor(Math.random() * conditions.length)],
    category: (['red', 'yellow', 'green'] as const)[Math.floor(Math.random() * 3)],
    source: sources[Math.floor(Math.random() * sources.length)],
    paramedic: `EMT ${['Rajan', 'Suresh', 'Mohan', 'Anil'][Math.floor(Math.random() * 4)]}`,
    vitals: {
      heartRate: Math.floor(Math.random() * 60) + 60,
      bloodPressure: { systolic: Math.floor(Math.random() * 80) + 80, diastolic: Math.floor(Math.random() * 40) + 50 },
      oxygenSaturation: Math.floor(Math.random() * 15) + 85
    }
  }));
};

// Generate resource status
const generateResourceStatus = (mode: DashboardMode): ResourceStatus => {
  const totalBeds = mode === 'icu' ? 20 : mode === 'er' ? 40 : 100;
  const occupancy = mode === 'icu' ? 0.85 : mode === 'er' ? 0.7 : 0.5;
  const occupied = Math.floor(totalBeds * occupancy);
  
  return {
    totalBeds,
    occupiedBeds: occupied,
    availableBeds: totalBeds - occupied,
    ventilators: { total: mode === 'icu' ? 15 : 5, inUse: mode === 'icu' ? 12 : 3 },
    dialysisMachines: { total: mode === 'icu' ? 6 : 2, inUse: mode === 'icu' ? 4 : 1 },
    monitors: { total: mode === 'icu' ? 20 : 15, inUse: mode === 'icu' ? 18 : 12 },
    isolation: { total: 5, inUse: Math.floor(Math.random() * 4) + 1 },
    staff: {
      doctors: mode === 'icu' ? 4 : mode === 'er' ? 6 : 2,
      nurses: mode === 'icu' ? 12 : mode === 'er' ? 15 : 5,
      techs: mode === 'icu' ? 4 : mode === 'er' ? 5 : 2
    }
  };
};

// ==========================================
// CUSTOM DOT COMPONENT FOR SCATTER CHART
// ==========================================

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: Patient;
  onPatientClick: (patient: Patient) => void;
  onPatientHover: (patient: Patient | null) => void;
  accessibleMode: boolean;
}

const CustomDot = ({ cx, cy, payload, onPatientClick, onPatientHover, accessibleMode }: CustomDotProps) => {
  if (!cx || !cy || !payload) return null;
  
  const colors = accessibleMode ? STATUS_COLORS_ACCESSIBLE : STATUS_COLORS;
  const color = colors[payload.status];
  const size = payload.status === 'critical' ? 14 : payload.status === 'warning' ? 12 : 10;
  
  // Pulse animation for critical patients
  const isPulsing = payload.status === 'critical';
  
  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={() => onPatientClick(payload)}
      onMouseEnter={() => onPatientHover(payload)}
      onMouseLeave={() => onPatientHover(null)}
    >
      {/* Pulse effect for critical */}
      {isPulsing && (
        <circle
          cx={cx}
          cy={cy}
          r={size + 6}
          fill={color}
          opacity={0.3}
          className="animate-ping"
        />
      )}
      
      {/* Main dot */}
      <circle
        cx={cx}
        cy={cy}
        r={size}
        fill={color}
        stroke={payload.status === 'critical' ? '#fff' : color}
        strokeWidth={payload.status === 'critical' ? 2 : 1}
        filter={payload.status === 'critical' ? 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))' : undefined}
      />
      
      {/* Trend indicator */}
      {payload.trend === 'declining' && (
        <path
          d={`M${cx - 4} ${cy + size + 4} L${cx} ${cy + size + 8} L${cx + 4} ${cy + size + 4}`}
          fill={color}
        />
      )}
      {payload.trend === 'improving' && (
        <path
          d={`M${cx - 4} ${cy - size - 4} L${cx} ${cy - size - 8} L${cx + 4} ${cy - size - 4}`}
          fill={color}
        />
      )}
      
      {/* Pattern for color-blind accessibility */}
      {accessibleMode && (
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fontSize={8}
          fill="#fff"
          fontWeight="bold"
        >
          {STATUS_PATTERNS[payload.status]}
        </text>
      )}
    </g>
  );
};

// ==========================================
// PATIENT DETAIL CARD
// ==========================================

interface PatientDetailCardProps {
  patient: Patient | null;
  onClose: () => void;
  onVideoCall: (patient: Patient) => void;
  onMessage: (patient: Patient) => void;
}

const PatientDetailCard = ({ patient, onClose, onVideoCall, onMessage }: PatientDetailCardProps) => {
  if (!patient) return null;
  
  const statusConfig = {
    critical: { bg: 'bg-red-500/10 border-red-500', text: 'text-red-500', label: 'Critical' },
    warning: { bg: 'bg-amber-500/10 border-amber-500', text: 'text-amber-500', label: 'Warning' },
    stable: { bg: 'bg-green-500/10 border-green-500', text: 'text-green-500', label: 'Stable' }
  };
  
  const config = statusConfig[patient.status];
  
  const getTrendIcon = () => {
    switch (patient.trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-slate-400" />;
    }
  };
  
  return (
    <Card className={cn("border-2", config.bg)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {patient.name}
              <Badge className={cn(config.bg, config.text, "border")}>
                {config.label}
              </Badge>
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <User className="h-3 w-3" />
              {patient.age}y, {patient.gender} • {patient.id}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Location & Admission */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {patient.bedNumber}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {new Date(patient.admissionTime).toLocaleTimeString()}
          </div>
        </div>
        
        {/* Chief Complaint */}
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800">
          <p className="text-sm font-medium">{patient.chiefComplaint}</p>
        </div>
        
        {/* Risk Score */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Risk Score</span>
          <div className="flex items-center gap-2">
            <span className={cn("text-2xl font-bold", config.text)}>
              {patient.riskScore}
            </span>
            {getTrendIcon()}
          </div>
        </div>
        
        {/* Vital Signs Grid */}
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          <div className="p-1.5 sm:p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-center">
            <Heart className="h-4 w-4 text-red-500 mx-auto mb-1" />
            <p className="text-sm font-bold">{patient.vitalSigns.heartRate}</p>
            <p className="text-[10px] text-muted-foreground">HR</p>
          </div>
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-center">
            <Droplets className="h-4 w-4 text-blue-500 mx-auto mb-1" />
            <p className="text-sm font-bold">{patient.vitalSigns.oxygenSaturation}%</p>
            <p className="text-[10px] text-muted-foreground">SpO₂</p>
          </div>
          <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-center">
            <Activity className="h-4 w-4 text-purple-500 mx-auto mb-1" />
            <p className="text-sm font-bold">{patient.vitalSigns.bloodPressure.systolic}/{patient.vitalSigns.bloodPressure.diastolic}</p>
            <p className="text-[10px] text-muted-foreground">BP</p>
          </div>
          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-center">
            <Thermometer className="h-4 w-4 text-orange-500 mx-auto mb-1" />
            <p className="text-sm font-bold">{patient.vitalSigns.temperature}°C</p>
            <p className="text-[10px] text-muted-foreground">Temp</p>
          </div>
          <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30 text-center">
            <Wind className="h-4 w-4 text-teal-500 mx-auto mb-1" />
            <p className="text-sm font-bold">{patient.vitalSigns.respiratoryRate}</p>
            <p className="text-[10px] text-muted-foreground">RR</p>
          </div>
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-center">
            <User className="h-4 w-4 text-slate-500 mx-auto mb-1" />
            <p className="text-[10px] font-medium truncate">{patient.assignedDoctor}</p>
            <p className="text-[10px] text-muted-foreground">Doctor</p>
          </div>
        </div>
        
        {/* Alerts */}
        {patient.alerts.length > 0 && (
          <div className="space-y-1">
            {patient.alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {alert}
              </div>
            ))}
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button 
            size="sm" 
            className="flex-1"
            onClick={() => onVideoCall(patient)}
          >
            <Video className="h-4 w-4 mr-1" />
            Video Call
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            className="flex-1"
            onClick={() => onMessage(patient)}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Message
          </Button>
          <Button size="sm" variant="outline">
            <FileText className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ==========================================
// ALERT NOTIFICATION COMPONENT
// ==========================================

interface AlertNotificationProps {
  alerts: AlertEvent[];
  onAcknowledge: (alertId: string) => void;
  onDismissAll: () => void;
}

const AlertNotification = ({ alerts, onAcknowledge, onDismissAll }: AlertNotificationProps) => {
  const unacknowledged = alerts.filter(a => !a.acknowledged);
  
  if (unacknowledged.length === 0) return null;
  
  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm">
      {unacknowledged.slice(0, 3).map((alert) => (
        <Card 
          key={alert.id}
          className={cn(
            "border-2 animate-in slide-in-from-right duration-300",
            alert.type === 'critical' ? "border-red-500 bg-red-50 dark:bg-red-950/50" :
            alert.type === 'warning' ? "border-amber-500 bg-amber-50 dark:bg-amber-950/50" :
            "border-blue-500 bg-blue-50 dark:bg-blue-950/50"
          )}
        >
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {alert.type === 'critical' ? (
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                ) : alert.type === 'warning' ? (
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                ) : (
                  <Bell className="h-5 w-5 text-blue-500 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-sm">{alert.patientName}</p>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => onAcknowledge(alert.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {unacknowledged.length > 3 && (
        <Button variant="outline" size="sm" className="w-full" onClick={onDismissAll}>
          Dismiss All ({unacknowledged.length - 3} more)
        </Button>
      )}
    </div>
  );
};

// ==========================================
// CUSTOM TOOLTIP FOR CHART
// ==========================================

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
}

const CustomChartTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload || !payload[0]) return null;
  
  const patient = payload[0].payload as Patient;
  const statusColors = {
    critical: 'text-red-500',
    warning: 'text-amber-500',
    stable: 'text-green-500'
  };
  
  return (
    <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">{patient.name}</span>
        <Badge className={cn(
          patient.status === 'critical' ? 'bg-red-500' :
          patient.status === 'warning' ? 'bg-amber-500' : 'bg-green-500',
          'text-white text-xs'
        )}>
          {patient.status.toUpperCase()}
        </Badge>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Age:</span>
          <span>{patient.age} years</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Risk Score:</span>
          <span className={statusColors[patient.status]}>{patient.riskScore}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">HR:</span>
          <span>{patient.vitalSigns.heartRate} bpm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">SpO₂:</span>
          <span>{patient.vitalSigns.oxygenSaturation}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">BP:</span>
          <span>{patient.vitalSigns.bloodPressure.systolic}/{patient.vitalSigns.bloodPressure.diastolic}</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-2">Click for details</p>
    </div>
  );
};

// ==========================================
// ICU BEDSIDE MONITOR COMPONENT
// ==========================================

interface ICUMonitorProps {
  patient: Patient;
  compact?: boolean;
}

const ICUBedsideMonitor = ({ patient, compact = false }: ICUMonitorProps) => {
  const [ecgData, setEcgData] = useState<{ x: number; y: number }[]>([]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setEcgData(generateECGData(patient.vitalSigns.heartRate, 100));
    }, 1000);
    return () => clearInterval(interval);
  }, [patient.vitalSigns.heartRate]);
  
  const getVitalColor = (type: string, value: number) => {
    if (type === 'hr') return value > 100 || value < 50 ? 'text-red-500' : value > 90 ? 'text-yellow-500' : 'text-green-400';
    if (type === 'spo2') return value < 90 ? 'text-red-500' : value < 94 ? 'text-yellow-500' : 'text-cyan-400';
    if (type === 'bp') return value > 160 || value < 90 ? 'text-red-500' : value > 140 ? 'text-yellow-500' : 'text-white';
    return 'text-white';
  };
  
  if (compact) {
    return (
      <div className="bg-black rounded-lg p-2 font-mono text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-green-400">{patient.name}</span>
          <span className="text-slate-500">{patient.bedNumber}</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 text-center">
          <div>
            <span className={cn("text-xs sm:text-sm font-bold", getVitalColor('hr', patient.vitalSigns.heartRate))}>{patient.vitalSigns.heartRate}</span>
            <span className="text-slate-500 block text-[8px]">HR</span>
          </div>
          <div>
            <span className={cn("text-sm font-bold", getVitalColor('spo2', patient.vitalSigns.oxygenSaturation))}>{patient.vitalSigns.oxygenSaturation}</span>
            <span className="text-slate-500 block text-[8px]">SpO₂</span>
          </div>
          <div>
            <span className={cn("text-sm font-bold", getVitalColor('bp', patient.vitalSigns.bloodPressure.systolic))}>{patient.vitalSigns.bloodPressure.systolic}/{patient.vitalSigns.bloodPressure.diastolic}</span>
            <span className="text-slate-500 block text-[8px]">BP</span>
          </div>
          <div>
            <span className="text-sm font-bold text-orange-400">{patient.vitalSigns.temperature}</span>
            <span className="text-slate-500 block text-[8px]">Temp</span>
          </div>
          <div>
            <span className="text-sm font-bold text-teal-400">{patient.vitalSigns.respiratoryRate}</span>
            <span className="text-slate-500 block text-[8px]">RR</span>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <Card className="bg-black text-white border-slate-700 overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Badge className={cn(
              patient.status === 'critical' ? 'bg-red-600 animate-pulse' :
              patient.status === 'warning' ? 'bg-amber-600' : 'bg-green-600'
            )}>
              {patient.status.toUpperCase()}
            </Badge>
            <span className="font-mono text-sm">{patient.name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <BedDouble className="h-3 w-3" />
            {patient.bedNumber}
            {patient.ventilator && <Wind className="h-3 w-3 text-cyan-400" />}
            {patient.dialysis && <Droplets className="h-3 w-3 text-blue-400" />}
          </div>
        </div>
        
        {/* ECG Waveform */}
        <div className="h-20 px-2 border-b border-slate-800">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ecgData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <Area
                type="monotone"
                dataKey="y"
                stroke="#22c55e"
                fill="rgba(34, 197, 94, 0.1)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        {/* Vital Signs Grid */}
        <div className="grid grid-cols-3 divide-x divide-slate-800">
          {/* Heart Rate */}
          <div className="p-1 sm:p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Heart className="h-3 w-3 text-red-500" />
              <span className="text-[10px] text-slate-400">HR</span>
            </div>
            <span className={cn("text-2xl font-bold font-mono", getVitalColor('hr', patient.vitalSigns.heartRate))}>
              {patient.vitalSigns.heartRate}
            </span>
            <span className="text-[10px] text-slate-500 block">bpm</span>
          </div>
          
          {/* SpO2 */}
          <div className="p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Droplets className="h-3 w-3 text-cyan-500" />
              <span className="text-[10px] text-slate-400">SpO₂</span>
            </div>
            <span className={cn("text-2xl font-bold font-mono", getVitalColor('spo2', patient.vitalSigns.oxygenSaturation))}>
              {patient.vitalSigns.oxygenSaturation}
            </span>
            <span className="text-[10px] text-slate-500 block">%</span>
          </div>
          
          {/* Blood Pressure */}
          <div className="p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Activity className="h-3 w-3 text-purple-500" />
              <span className="text-[10px] text-slate-400">NIBP</span>
            </div>
            <span className={cn("text-xl font-bold font-mono", getVitalColor('bp', patient.vitalSigns.bloodPressure.systolic))}>
              {patient.vitalSigns.bloodPressure.systolic}/{patient.vitalSigns.bloodPressure.diastolic}
            </span>
            <span className="text-[10px] text-slate-500 block">MAP: {patient.vitalSigns.map}</span>
          </div>
        </div>
        
        {/* Second Row */}
        <div className="grid grid-cols-4 divide-x divide-slate-800 border-t border-slate-800">
          <div className="p-2 text-center">
            <span className="text-[10px] text-slate-400">Temp</span>
            <span className="text-lg font-bold font-mono text-orange-400 block">{patient.vitalSigns.temperature}°</span>
          </div>
          <div className="p-2 text-center">
            <span className="text-[10px] text-slate-400">RR</span>
            <span className="text-lg font-bold font-mono text-teal-400 block">{patient.vitalSigns.respiratoryRate}</span>
          </div>
          <div className="p-2 text-center">
            <span className="text-[10px] text-slate-400">GCS</span>
            <span className="text-lg font-bold font-mono text-white block">{patient.vitalSigns.gcs || 15}</span>
          </div>
          <div className="p-2 text-center">
            <span className="text-[10px] text-slate-400">NEWS</span>
            <span className={cn("text-lg font-bold font-mono block",
              (patient.vitalSigns.newsScore || 0) >= 7 ? 'text-red-500' :
              (patient.vitalSigns.newsScore || 0) >= 5 ? 'text-orange-500' :
              (patient.vitalSigns.newsScore || 0) >= 3 ? 'text-yellow-500' : 'text-green-400'
            )}>{patient.vitalSigns.newsScore || 0}</span>
          </div>
        </div>
        
        {/* Ventilator & Infusions */}
        {(patient.ventilator || (patient.infusions && patient.infusions.length > 0)) && (
          <div className="border-t border-slate-800 p-2">
            {patient.ventilator && (
              <div className="flex items-center gap-2 text-xs mb-1">
                <Wind className="h-3 w-3 text-cyan-400" />
                <span className="text-cyan-400">{patient.ventilator.mode}</span>
                <span className="text-slate-400">FiO₂:{patient.ventilator.fio2}%</span>
                <span className="text-slate-400">PEEP:{patient.ventilator.peep}</span>
                <span className="text-slate-400">TV:{patient.ventilator.tidalVolume}</span>
              </div>
            )}
            {patient.infusions && patient.infusions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {patient.infusions.slice(0, 3).map((inf, idx) => (
                  <Badge key={idx} variant="outline" className={cn("text-[9px]",
                    inf.status === 'alarm' ? 'border-red-500 text-red-400 animate-pulse' : 'border-slate-600 text-slate-300'
                  )}>
                    <Pill className="h-2 w-2 mr-1" />
                    {inf.drug} {inf.rate}{inf.unit}
                  </Badge>
                ))}
                {patient.infusions.length > 3 && (
                  <Badge variant="outline" className="text-[9px] border-slate-600">+{patient.infusions.length - 3}</Badge>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ==========================================
// TRIAGE QUEUE COMPONENT (ER)
// ==========================================

interface TriageQueueProps {
  patients: Patient[];
  onSelect: (patient: Patient) => void;
}

const TriageQueue = ({ patients, onSelect }: TriageQueueProps) => {
  const sortedPatients = useMemo(() => {
    return [...patients]
      .filter(p => p.triageCategory)
      .sort((a, b) => (a.triageCategory || 5) - (b.triageCategory || 5) || (a.waitTime || 0) - (b.waitTime || 0));
  }, [patients]);
  
  const queueByCategory = useMemo(() => {
    const queue: Record<number, Patient[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    sortedPatients.forEach(p => {
      if (p.triageCategory) queue[p.triageCategory].push(p);
    });
    return queue;
  }, [sortedPatients]);
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clipboard className="h-4 w-4" />
          Triage Queue
          <Badge variant="secondary">{sortedPatients.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <div className="space-y-2">
          {([1, 2, 3, 4, 5] as const).map(cat => {
            const config = TRIAGE_COLORS[cat];
            const pats = queueByCategory[cat];
            if (pats.length === 0) return null;
            
            return (
              <div key={cat}>
                <div className={cn("flex items-center gap-2 px-2 py-1 rounded-t text-xs font-medium", config.bg, config.text)}>
                  <span>{config.label}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{pats.length}</Badge>
                </div>
                <ScrollArea className="max-h-24">
                  {pats.slice(0, 5).map(patient => (
                    <div
                      key={patient.id}
                      className="flex items-center justify-between p-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border-b last:border-0"
                      onClick={() => onSelect(patient)}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{patient.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{patient.chiefComplaint}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="h-2 w-2 mr-1" />
                          {patient.waitTime}m
                        </Badge>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ==========================================
// AMBULANCE TRACKER (ER)
// ==========================================

interface AmbulanceTrackerProps {
  ambulances: AmbulanceIncoming[];
}

const AmbulanceTracker = ({ ambulances }: AmbulanceTrackerProps) => {
  const sortedAmbulances = useMemo(() => {
    return [...ambulances].sort((a, b) => a.eta - b.eta);
  }, [ambulances]);
  
  return (
    <Card className="bg-gradient-to-br from-red-950/50 to-slate-900 border-red-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-red-400">
          <Ambulance className="h-4 w-4 animate-pulse" />
          Incoming Ambulances
          <Badge className="bg-red-600">{ambulances.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="max-h-48">
          {sortedAmbulances.map(amb => (
            <div key={amb.id} className="flex items-center gap-3 p-2 border-b border-slate-800 last:border-0">
              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
                amb.category === 'red' ? 'bg-red-600 text-white animate-pulse' :
                amb.category === 'yellow' ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'
              )}>
                {amb.eta}m
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{amb.patientCondition}</p>
                <p className="text-[10px] text-slate-400">{amb.source} • {amb.paramedic}</p>
              </div>
              {amb.vitals && (
                <div className="text-[10px] text-slate-400">
                  <span className="text-red-400">{amb.vitals.heartRate}</span> /
                  <span className="text-cyan-400"> {amb.vitals.oxygenSaturation}%</span>
                </div>
              )}
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

// ==========================================
// RESOURCE STATUS BAR
// ==========================================

interface ResourceBarProps {
  resources: ResourceStatus;
  mode: DashboardMode;
}

const ResourceBar = ({ resources, mode }: ResourceBarProps) => {
  const bedOccupancy = Math.round((resources.occupiedBeds / resources.totalBeds) * 100);
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">Beds</p>
              <p className="text-lg font-bold text-white">{resources.availableBeds}/{resources.totalBeds}</p>
            </div>
            <BedDouble className={cn("h-5 w-5", bedOccupancy > 90 ? 'text-red-500' : bedOccupancy > 70 ? 'text-amber-500' : 'text-green-500')} />
          </div>
          <Progress value={bedOccupancy} className="h-1 mt-2" />
        </CardContent>
      </Card>
      
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">Ventilators</p>
              <p className="text-lg font-bold text-white">{resources.ventilators.total - resources.ventilators.inUse}/{resources.ventilators.total}</p>
            </div>
            <Wind className="h-5 w-5 text-cyan-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">Dialysis</p>
              <p className="text-lg font-bold text-white">{resources.dialysisMachines.total - resources.dialysisMachines.inUse}/{resources.dialysisMachines.total}</p>
            </div>
            <Droplets className="h-5 w-5 text-blue-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">Monitors</p>
              <p className="text-lg font-bold text-white">{resources.monitors.total - resources.monitors.inUse}/{resources.monitors.total}</p>
            </div>
            <MonitorSpeaker className="h-5 w-5 text-purple-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">Isolation</p>
              <p className="text-lg font-bold text-white">{resources.isolation.total - resources.isolation.inUse}/{resources.isolation.total}</p>
            </div>
            <Shield className="h-5 w-5 text-orange-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">Staff On Duty</p>
              <p className="text-lg font-bold text-white">{resources.staff.doctors + resources.staff.nurses}</p>
            </div>
            <Users className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex gap-1 mt-1">
            <Badge variant="outline" className="text-[8px] border-slate-600">{resources.staff.doctors}D</Badge>
            <Badge variant="outline" className="text-[8px] border-slate-600">{resources.staff.nurses}N</Badge>
            <Badge variant="outline" className="text-[8px] border-slate-600">{resources.staff.techs}T</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================

const RemoteHealthMonitoring = () => {
  const { currentDoctor } = useAuth();
  const { toast } = useToast();
  
  // Dashboard Mode
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('remote');
  const [viewMode, setViewMode] = useState<'grid' | 'scatter' | 'list'>('scatter');
  
  // State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [hoveredPatient, setHoveredPatient] = useState<Patient | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceIncoming[]>([]);
  const [resources, setResources] = useState<ResourceStatus>(generateResourceStatus('remote'));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [accessibleMode, setAccessibleMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCodeBlue, setShowCodeBlue] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  
  // Filters
  const [ageRange, setAgeRange] = useState<[number, number]>([0, 100]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize patients based on mode
  useEffect(() => {
    const patientCount = dashboardMode === 'icu' ? 20 : dashboardMode === 'er' ? 35 : 50;
    setPatients(generateMockPatients(patientCount, dashboardMode));
    setResources(generateResourceStatus(dashboardMode));
    if (dashboardMode === 'er') {
      setAmbulances(generateAmbulances(Math.floor(Math.random() * 4) + 1));
    }
    // Set default view mode per dashboard mode
    if (dashboardMode === 'icu') {
      setViewMode('grid');
    } else if (dashboardMode === 'er') {
      setViewMode('scatter');
    } else {
      setViewMode('scatter');
    }
  }, [dashboardMode]);
  
  // Real-time updates simulation
  useEffect(() => {
    updateIntervalRef.current = setInterval(() => {
      setPatients(prevPatients => {
        return prevPatients.map(patient => {
          // Random chance to update vitals
          if (Math.random() > 0.7) {
            const newRiskScore = Math.max(0, Math.min(100, patient.riskScore + (Math.random() - 0.5) * 10));
            const oldStatus = patient.status;
            
            let newStatus: Patient['status'] = 'stable';
            if (newRiskScore >= RISK_THRESHOLDS.CRITICAL) newStatus = 'critical';
            else if (newRiskScore >= RISK_THRESHOLDS.WARNING) newStatus = 'warning';
            
            // Create alert on status change
            if (newStatus !== oldStatus) {
              if ((oldStatus === 'stable' && newStatus === 'warning') ||
                  (oldStatus === 'warning' && newStatus === 'critical') ||
                  (oldStatus === 'stable' && newStatus === 'critical')) {
                const newAlert: AlertEvent = {
                  id: `alert-${Date.now()}`,
                  patientId: patient.id,
                  patientName: patient.name,
                  type: newStatus === 'critical' ? 'critical' : 'warning',
                  message: `Status changed from ${oldStatus} to ${newStatus}`,
                  timestamp: new Date(),
                  acknowledged: false,
                  priority: newStatus === 'critical' ? 1 : 2
                };
                setAlerts(prev => [newAlert, ...prev].slice(0, 50));
                
                // Play sound for critical alerts
                if (soundEnabled && newStatus === 'critical') {
                  playAlertSound();
                }
              }
            }
            
            return {
              ...patient,
              riskScore: Math.round(newRiskScore),
              status: newStatus,
              vitalSigns: {
                ...patient.vitalSigns,
                heartRate: Math.max(40, Math.min(180, patient.vitalSigns.heartRate + Math.floor((Math.random() - 0.5) * 10))),
                oxygenSaturation: Math.max(80, Math.min(100, patient.vitalSigns.oxygenSaturation + Math.floor((Math.random() - 0.5) * 3))),
              },
              trend: newRiskScore > patient.riskScore ? 'declining' : newRiskScore < patient.riskScore ? 'improving' : patient.trend,
              lastUpdated: new Date()
            };
          }
          return patient;
        });
      });
    }, 3000); // Update every 3 seconds
    
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [soundEnabled]);
  
  // Play alert sound
  const playAlertSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/emergency-alert.mp3');
      }
      audioRef.current.play().catch(() => {});
    } catch (e) {}
  }, []);
  
  // Filtered patients
  const filteredPatients = useMemo(() => {
    return patients.filter(patient => {
      // Age filter
      if (patient.age < ageRange[0] || patient.age > ageRange[1]) return false;
      
      // Status filter
      if (statusFilter !== 'all' && patient.status !== statusFilter) return false;
      
      // Location filter
      if (locationFilter !== 'all' && !patient.location.includes(locationFilter)) return false;
      
      // Search query
      if (searchQuery && !patient.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !patient.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      return true;
    });
  }, [patients, ageRange, statusFilter, locationFilter, searchQuery]);
  
  // Statistics
  const stats: DashboardStats = useMemo(() => {
    const total = filteredPatients.length;
    const critical = filteredPatients.filter(p => p.status === 'critical').length;
    const warning = filteredPatients.filter(p => p.status === 'warning').length;
    const stable = filteredPatients.filter(p => p.status === 'stable').length;
    const avgRiskScore = total > 0 
      ? Math.round(filteredPatients.reduce((sum, p) => sum + p.riskScore, 0) / total)
      : 0;
    
    return { total, critical, warning, stable, avgRiskScore };
  }, [filteredPatients]);
  
  // Chart data
  const chartData = useMemo(() => {
    return filteredPatients.map(patient => ({
      ...patient,
      x: patient.age,
      y: patient.riskScore
    }));
  }, [filteredPatients]);
  
  // Unique locations for filter
  const locations = useMemo(() => {
    return [...new Set(patients.map(p => p.location))];
  }, [patients]);
  
  // Handlers
  const handlePatientClick = (patient: Patient) => {
    setSelectedPatient(patient);
  };
  
  const handlePatientHover = (patient: Patient | null) => {
    setHoveredPatient(patient);
  };
  
  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  };
  
  const handleDismissAllAlerts = () => {
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
  };
  
  const handleVideoCall = (patient: Patient) => {
    toast({
      title: "Starting Video Call",
      description: `Connecting to ${patient.name}...`
    });
    window.open(`/doctor/video?room=patient-${patient.id}`, '_blank');
  };
  
  const handleMessage = (patient: Patient) => {
    toast({
      title: "Opening Chat",
      description: `Starting chat with ${patient.name}'s care team`
    });
  };
  
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
  
  return (
    <MainLayout>
      {/* Alert Notifications */}
      <AlertNotification 
        alerts={alerts}
        onAcknowledge={handleAcknowledgeAlert}
        onDismissAll={handleDismissAllAlerts}
      />
      
      {/* Code Blue Alert Modal */}
      <Dialog open={showCodeBlue} onOpenChange={setShowCodeBlue}>
        <DialogContent className="bg-red-950 border-red-600 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2 text-red-400">
              <AlertOctagon className="h-8 w-8 animate-pulse" />
              CODE BLUE
            </DialogTitle>
            <DialogDescription className="text-red-200">
              Initiate emergency response team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select>
              <SelectTrigger className="bg-red-900 border-red-700">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {patients.slice(0, 10).map(p => (
                  <SelectItem key={p.id} value={p.bedNumber}>{p.bedNumber} - {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Brief description (optional)" className="bg-red-900 border-red-700" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCodeBlue(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={() => {
                toast({ title: "🚨 CODE BLUE ACTIVATED", description: "Emergency response team notified" });
                setShowCodeBlue(false);
                playAlertSound();
              }}>
                <Siren className="h-4 w-4 mr-2 animate-pulse" />
                ACTIVATE CODE BLUE
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      
      <div ref={containerRef} className="space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-xl", 
              dashboardMode === 'icu' ? "bg-gradient-to-br from-purple-500 to-indigo-600" :
              dashboardMode === 'er' ? "bg-gradient-to-br from-red-500 to-orange-500" :
              "bg-gradient-to-br from-teal-500 to-cyan-500"
            )}>
              {dashboardMode === 'icu' ? <HeartPulse className="h-7 w-7 text-white" /> :
               dashboardMode === 'er' ? <Siren className="h-7 w-7 text-white" /> :
               <Radio className="h-7 w-7 text-white" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                {dashboardMode === 'icu' ? 'ICU Command Center' :
                 dashboardMode === 'er' ? 'ER/Casualty Dashboard' :
                 'Remote Health Monitoring'}
              </h1>
              <p className="text-muted-foreground text-sm">
                {dashboardMode === 'icu' ? 'Intensive Care Unit • Real-time ICU monitoring' :
                 dashboardMode === 'er' ? 'Emergency Department • Triage & casualty management' :
                 'Home patients • Remote vital signs monitoring'}
                {' '}• Last updated: {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dashboard Mode Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <Button
                variant={dashboardMode === 'remote' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDashboardMode('remote')}
                className="gap-1"
              >
                <Radio className="h-4 w-4" />
                <span className="hidden sm:inline">Remote</span>
              </Button>
              <Button
                variant={dashboardMode === 'er' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDashboardMode('er')}
                className="gap-1"
              >
                <Siren className="h-4 w-4" />
                <span className="hidden sm:inline">ER</span>
              </Button>
              <Button
                variant={dashboardMode === 'icu' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDashboardMode('icu')}
                className="gap-1"
              >
                <HeartPulse className="h-4 w-4" />
                <span className="hidden sm:inline">ICU</span>
              </Button>
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'scatter' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('scatter')}
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-40"
              />
            </div>
            
            {/* Code Blue Button (ER/ICU only) */}
            {(dashboardMode === 'er' || dashboardMode === 'icu') && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowCodeBlue(true)}
                className="bg-red-600 hover:bg-red-700 animate-pulse"
              >
                <AlertOctagon className="h-4 w-4 mr-1" />
                Code Blue
              </Button>
            )}
            
            {/* Filters Toggle */}
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4" />
            </Button>
            
            {/* Sound Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(soundEnabled && "bg-teal-500/10 border-teal-500")}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            
            {/* Fullscreen */}
            <Button variant="outline" size="icon" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            
            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAccessibleMode(!accessibleMode)}>
                  <Eye className="h-4 w-4 mr-2" />
                  {accessibleMode ? 'Disable' : 'Enable'} Color-blind Mode
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowHandover(true)}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Shift Handover
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Report
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="h-4 w-4 mr-2" />
                  Export Data
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  const count = dashboardMode === 'icu' ? 20 : dashboardMode === 'er' ? 35 : 50;
                  setPatients(generateMockPatients(count, dashboardMode));
                }}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Resource Bar (ICU/ER only) */}
        {(dashboardMode === 'icu' || dashboardMode === 'er') && (
          <ResourceBar resources={resources} mode={dashboardMode} />
        )}
        
        {/* Filters Panel */}
        {showFilters && (
          <Card className="bg-slate-50 dark:bg-slate-800/50">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Age Range */}
                <div className="space-y-2">
                  <Label>Age Range: {ageRange[0]} - {ageRange[1]}</Label>
                  <Slider
                    value={ageRange}
                    onValueChange={(value) => setAgeRange(value as [number, number])}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
                
                {/* Status Filter */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="stable">Stable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Location Filter */}
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {locations.map(loc => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Reset Filters */}
                <div className="flex items-end">
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      setAgeRange([0, 100]);
                      setStatusFilter('all');
                      setLocationFilter('all');
                      setSearchQuery('');
                    }}
                  >
                    Reset Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-white dark:bg-slate-800/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Patients</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Users className="h-8 w-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-red-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-red-600 dark:text-red-400">Critical</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-amber-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Warning</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.warning}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50 border-green-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400">Stable</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.stable}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-slate-800/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Avg Risk</p>
                  <p className="text-2xl font-bold">{stats.avgRiskScore}</p>
                </div>
                <Activity className="h-8 w-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Visualization Area */}
          <div className="lg:col-span-3">
            {/* Grid View - ICU Bedside Monitors */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredPatients
                  .sort((a, b) => {
                    if (a.status === 'critical' && b.status !== 'critical') return -1;
                    if (a.status !== 'critical' && b.status === 'critical') return 1;
                    return b.riskScore - a.riskScore;
                  })
                  .slice(0, dashboardMode === 'icu' ? 12 : 18)
                  .map(patient => (
                    <div key={patient.id} onClick={() => setSelectedPatient(patient)} className="cursor-pointer">
                      {dashboardMode === 'icu' ? (
                        <ICUBedsideMonitor patient={patient} />
                      ) : (
                        <ICUBedsideMonitor patient={patient} compact />
                      )}
                    </div>
                  ))}
              </div>
            )}
            
            {/* Scatter Chart View */}
            {viewMode === 'scatter' && (
              <Card className="bg-slate-900 text-white">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg text-white">Patient Health Matrix</CardTitle>
                      <CardDescription className="text-slate-400">
                        Age vs Risk Score • Real-time visualization
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500" />
                        <span className="text-slate-300">Critical</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-amber-500" />
                        <span className="text-slate-300">Warning</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-green-500" />
                        <span className="text-slate-300">Stable</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[450px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis 
                          type="number" 
                          dataKey="x" 
                          name="Age"
                          domain={[0, 100]}
                          tickCount={11}
                          stroke="#94a3b8"
                          label={{ value: 'Patient Age (years)', position: 'bottom', offset: 20, fill: '#94a3b8' }}
                        />
                        <YAxis 
                          type="number" 
                          dataKey="y" 
                          name="Risk Score"
                          domain={[0, 100]}
                          tickCount={11}
                          stroke="#94a3b8"
                          label={{ value: 'Health Risk Score', angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8' }}
                        />
                        <ReferenceLine y={RISK_THRESHOLDS.CRITICAL} stroke="#ef4444" strokeDasharray="5 5" />
                        <ReferenceLine y={RISK_THRESHOLDS.WARNING} stroke="#f59e0b" strokeDasharray="5 5" />
                        <Scatter
                          name="Patients"
                          data={chartData}
                          shape={(props: any) => (
                            <CustomDot
                              {...props}
                              onPatientClick={handlePatientClick}
                              onPatientHover={handlePatientHover}
                              accessibleMode={accessibleMode}
                            />
                          )}
                        />
                        <recharts.Tooltip content={<CustomChartTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#64748b' }} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* List View */}
            {viewMode === 'list' && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">All Patients</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    <div className="divide-y">
                      {filteredPatients
                        .sort((a, b) => {
                          if (a.status === 'critical' && b.status !== 'critical') return -1;
                          if (a.status !== 'critical' && b.status === 'critical') return 1;
                          return b.riskScore - a.riskScore;
                        })
                        .map(patient => (
                          <div
                            key={patient.id}
                            className="flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            onClick={() => setSelectedPatient(patient)}
                          >
                            <Badge className={cn(
                              "w-16 justify-center",
                              patient.status === 'critical' ? 'bg-red-500' :
                              patient.status === 'warning' ? 'bg-amber-500' : 'bg-green-500'
                            )}>
                              {patient.riskScore}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{patient.name}</span>
                                <span className="text-xs text-muted-foreground">{patient.age}y, {patient.gender}</span>
                                {patient.ventilator && <Wind className="h-3 w-3 text-cyan-500" />}
                                {patient.dialysis && <Droplets className="h-3 w-3 text-blue-500" />}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{patient.chiefComplaint}</p>
                            </div>
                            <div className="text-right text-xs">
                              <p className="font-mono">{patient.bedNumber}</p>
                              <p className="text-muted-foreground">{patient.assignedDoctor}</p>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center text-xs">
                              <div>
                                <span className={cn("font-bold", patient.vitalSigns.heartRate > 100 ? 'text-red-500' : 'text-green-500')}>
                                  {patient.vitalSigns.heartRate}
                                </span>
                                <span className="text-muted-foreground block">HR</span>
                              </div>
                              <div>
                                <span className={cn("font-bold", patient.vitalSigns.oxygenSaturation < 94 ? 'text-red-500' : 'text-cyan-500')}>
                                  {patient.vitalSigns.oxygenSaturation}
                                </span>
                                <span className="text-muted-foreground block">SpO₂</span>
                              </div>
                              <div>
                                <span className="font-bold">{patient.vitalSigns.bloodPressure.systolic}/{patient.vitalSigns.bloodPressure.diastolic}</span>
                                <span className="text-muted-foreground block">BP</span>
                              </div>
                              <div>
                                <span className={cn("font-bold",
                                  (patient.vitalSigns.newsScore || 0) >= 7 ? 'text-red-500' :
                                  (patient.vitalSigns.newsScore || 0) >= 5 ? 'text-orange-500' : 'text-green-500'
                                )}>
                                  {patient.vitalSigns.newsScore || 0}
                                </span>
                                <span className="text-muted-foreground block">NEWS</span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Patient Detail / Sidebar */}
          <div className="space-y-4">
            {/* Ambulance Tracker (ER only) */}
            {dashboardMode === 'er' && ambulances.length > 0 && (
              <AmbulanceTracker ambulances={ambulances} />
            )}
            
            {/* Triage Queue (ER only) */}
            {dashboardMode === 'er' && (
              <TriageQueue patients={filteredPatients} onSelect={setSelectedPatient} />
            )}
            
            {/* Selected Patient Details */}
            {selectedPatient ? (
              <PatientDetailCard
                patient={selectedPatient}
                onClose={() => setSelectedPatient(null)}
                onVideoCall={handleVideoCall}
                onMessage={handleMessage}
              />
            ) : (
              <Card className="bg-white dark:bg-slate-800/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Critical Patients</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    {filteredPatients
                      .filter(p => p.status === 'critical')
                      .slice(0, 10)
                      .map(patient => (
                        <div
                          key={patient.id}
                          className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 px-2 rounded"
                          onClick={() => setSelectedPatient(patient)}
                        >
                          <div>
                            <p className="font-medium text-sm">{patient.name}</p>
                            <p className="text-xs text-muted-foreground">{patient.chiefComplaint}</p>
                          </div>
                          <Badge className="bg-red-500 text-white text-xs">
                            {patient.riskScore}
                          </Badge>
                        </div>
                      ))}
                    {filteredPatients.filter(p => p.status === 'critical').length === 0 && (
                      <p className="text-center text-muted-foreground text-sm py-4">
                        No critical patients
                      </p>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
            
            {/* Recent Alerts */}
            <Card className="bg-white dark:bg-slate-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-500" />
                  Recent Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  {alerts.slice(0, 10).map(alert => (
                    <div
                      key={alert.id}
                      className={cn(
                        "flex items-start gap-2 py-2 border-b border-slate-200 dark:border-slate-700 last:border-0",
                        alert.acknowledged && "opacity-50"
                      )}
                    >
                      {alert.type === 'critical' ? (
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{alert.patientName}</p>
                        <p className="text-xs text-muted-foreground">{alert.message}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {alert.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      No recent alerts
                    </p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

// Need to import Tooltip from recharts
import * as recharts from 'recharts';

export default RemoteHealthMonitoring;
