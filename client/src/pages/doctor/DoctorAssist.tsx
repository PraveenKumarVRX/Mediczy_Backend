import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  Brain,
  Search,
  BookOpen,
  Pill,
  Stethoscope,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Info,
  ExternalLink,
  Copy,
  History,
  Star,
  StarOff,
  MessageSquare,
  Loader2,
  ChevronRight,
  FileText,
  Activity,
  Heart,
  Thermometer,
  Droplets,
  Wind,
  Zap,
  Shield,
  Clock,
  Users,
  BookMarked,
  GraduationCap,
  FlaskConical,
  Microscope,
  Syringe,
  Dna,
  HeartPulse,
  BrainCircuit,
  ListChecks,
  Calculator,
  Scale,
  RefreshCw,
  Send,
  Sparkles,
  Globe,
  Library,
  Newspaper,
  Building2,
  Plus,
  X,
  ChevronDown,
  Filter,
  SortAsc,
  type LucideIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import api from "@/utils/api";

// ==========================================
// TYPE DEFINITIONS
// ==========================================

interface MedicalQuery {
  id: string;
  query: string;
  category: string;
  timestamp: Date;
  response?: CDSSResponse;
  isFavorite: boolean;
}

interface CDSSResponse {
  summary: string;
  clinicalGuidelines: ClinicalGuideline[];
  drugInfo: DrugInformation[];
  differentialDiagnosis: DifferentialDiagnosis[];
  labTests: LabTest[];
  references: MedicalReference[];
  warnings: ClinicalWarning[];
  icd10Codes: ICD10Code[];
}

interface ClinicalGuideline {
  title: string;
  source: string;
  sourceType: 'BMJ' | 'NEJM' | 'Lancet' | 'JAMA' | 'IJMR' | 'WHO' | 'CDC' | 'NICE' | 'UpToDate' | 'Wikipedia';
  recommendation: string;
  evidenceLevel: 'A' | 'B' | 'C' | 'D' | 'Expert Opinion';
  url?: string;
}

interface DrugInformation {
  name: string;
  genericName: string;
  drugClass: string;
  indications: string[];
  dosage: string;
  contraindications: string[];
  sideEffects: string[];
  interactions: string[];
  pregnancyCategory: string;
  source: string;
}

interface DifferentialDiagnosis {
  condition: string;
  probability: 'High' | 'Moderate' | 'Low';
  keyFeatures: string[];
  rulingOutTests: string[];
}

interface LabTest {
  name: string;
  purpose: string;
  normalRange: string;
  interpretation: string;
}

interface MedicalReference {
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi?: string;
  url?: string;
  abstract?: string;
}

interface ClinicalWarning {
  type: 'critical' | 'warning' | 'info';
  message: string;
  action?: string;
}

interface ICD10Code {
  code: string;
  description: string;
  category: string;
}

interface Specialty {
  id: string;
  name: string;
  icon: LucideIcon;
}

// ==========================================
// CONSTANTS
// ==========================================

const MEDICAL_SPECIALTIES: Specialty[] = [
  { id: 'general', name: 'General Medicine', icon: Stethoscope },
  { id: 'cardiology', name: 'Cardiology', icon: Heart },
  { id: 'neurology', name: 'Neurology', icon: Brain },
  { id: 'pulmonology', name: 'Pulmonology', icon: Wind },
  { id: 'gastroenterology', name: 'Gastroenterology', icon: Activity },
  { id: 'nephrology', name: 'Nephrology', icon: Droplets },
  { id: 'endocrinology', name: 'Endocrinology', icon: Dna },
  { id: 'oncology', name: 'Oncology', icon: Microscope },
  { id: 'infectious', name: 'Infectious Disease', icon: FlaskConical },
  { id: 'pediatrics', name: 'Pediatrics', icon: Users },
  { id: 'psychiatry', name: 'Psychiatry', icon: BrainCircuit },
  { id: 'orthopedics', name: 'Orthopedics', icon: Activity },
  { id: 'dermatology', name: 'Dermatology', icon: Shield },
  { id: 'ophthalmology', name: 'Ophthalmology', icon: Activity },
  { id: 'ent', name: 'ENT', icon: Activity },
  { id: 'emergency', name: 'Emergency Medicine', icon: Zap },
];

const MEDICAL_SOURCES = [
  { id: 'gale', name: 'Gale Encyclopedia of Medicine', region: 'Reference', icon: '📕', category: 'encyclopedia' },
  { id: 'bmj', name: 'British Medical Journal (BMJ)', region: 'UK', icon: '🇬🇧', category: 'journal' },
  { id: 'nejm', name: 'New England Journal of Medicine', region: 'USA', icon: '🇺🇸', category: 'journal' },
  { id: 'lancet', name: 'The Lancet', region: 'UK', icon: '🇬🇧', category: 'journal' },
  { id: 'jama', name: 'JAMA Network', region: 'USA', icon: '🇺🇸', category: 'journal' },
  { id: 'ijmr', name: 'Indian Journal of Medical Research', region: 'India', icon: '🇮🇳', category: 'journal' },
  { id: 'japi', name: 'Journal of Association of Physicians of India', region: 'India', icon: '🇮🇳', category: 'journal' },
  { id: 'who', name: 'WHO Guidelines', region: 'Global', icon: '🌐', category: 'guidelines' },
  { id: 'nice', name: 'NICE Guidelines', region: 'UK', icon: '🇬🇧', category: 'guidelines' },
  { id: 'uptodate', name: 'UpToDate', region: 'USA', icon: '📚', category: 'reference' },
  { id: 'wikipedia', name: 'Medical Wikipedia', region: 'Global', icon: '📖', category: 'reference' },
  { id: 'medscape', name: 'Medscape', region: 'USA', icon: '🩺', category: 'reference' },
  { id: 'pubmed', name: 'PubMed/NCBI', region: 'USA', icon: '🔬', category: 'database' },
];

const QUERY_CATEGORIES = [
  { id: 'diagnosis', name: 'Diagnosis', icon: Stethoscope },
  { id: 'treatment', name: 'Treatment', icon: Pill },
  { id: 'drug-info', name: 'Drug Information', icon: Syringe },
  { id: 'guidelines', name: 'Clinical Guidelines', icon: BookOpen },
  { id: 'differential', name: 'Differential Diagnosis', icon: ListChecks },
  { id: 'lab-tests', name: 'Lab Interpretation', icon: FlaskConical },
  { id: 'dosage', name: 'Dosage Calculator', icon: Calculator },
  { id: 'interactions', name: 'Drug Interactions', icon: AlertTriangle },
];

// ==========================================
// KNOWLEDGE BASE API
// ==========================================

interface KnowledgeResult {
  id: string;
  similarity: number;
  text: string;
  title: string;
  source: string;
  category: string;
  topic?: string;
  section?: string;
}

// Search the CDSS Knowledge Base (Gale Encyclopedia, etc.)
const searchKnowledgeBase = async (query: string, options?: { source?: string; k?: number }): Promise<KnowledgeResult[]> => {
  try {
    const response = await api.post('/cdss/knowledge/search', {
      query,
      k: options?.k || 5,
      source: options?.source,
      minSimilarity: 0.4
    });
    return response.data.results || [];
  } catch (error) {
    console.error('[CDSS Knowledge] Search error:', error);
    return [];
  }
};

// Get knowledge base statistics
const getKnowledgeStats = async () => {
  try {
    const response = await api.get('/cdss/knowledge/stats');
    return response.data;
  } catch (error) {
    console.error('[CDSS Knowledge] Stats error:', error);
    return { total_entries: 0, unique_sources: 0, sources: [] };
  }
};

// ==========================================
// AI-POWERED CDSS ENGINE (SIB + Groq)
// ==========================================

// Query CDSS using AI with timeout (non-blocking)
const queryAICDSS = async (query: string, category: string, specialty: string, timeoutMs = 8000): Promise<CDSSResponse | null> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await api.post('/cdss/knowledge/query', {
      query,
      category,
      specialty,
      searchKnowledge: true
    }, { signal: controller.signal });
    
    clearTimeout(timeout);
    
    if (response.data.success) {
      console.log(`[CDSS] Response from ${response.data.provider} (${response.data.model}) in ${response.data.latencyMs}ms`);
      // Normalize summary: may come as array from LLM
      let summary = response.data.summary || `AI-powered analysis for "${query}"`;
      if (Array.isArray(summary)) summary = summary.join(' ');
      return {
        summary,
        clinicalGuidelines: response.data.clinicalGuidelines || [],
        drugInfo: response.data.drugInfo || [],
        differentialDiagnosis: response.data.differentialDiagnosis || [],
        labTests: response.data.labTests || [],
        references: response.data.references || [],
        warnings: response.data.warnings || [],
        icd10Codes: response.data.icd10Codes || []
      };
    }
    return null;
  } catch (error: any) {
    if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      console.log('[CDSS AI] Request timed out, using local data');
    } else {
      console.error('[CDSS AI] Query error:', error.message);
    }
    return null;
  }
};

// ==========================================
// CDSS ENGINE (Local First + AI Enhancement)
// ==========================================

const generateCDSSResponse = async (query: string, category: string, specialty: string): Promise<CDSSResponse> => {
  // Generate local response first (instant)
  const localResponse = generateLocalCDSSResponse(query, category, specialty);
  
  // Try AI enhancement with enough timeout for LLM
  try {
    const aiResponse = await queryAICDSS(query, category, specialty, 12000);
    if (aiResponse && (aiResponse.clinicalGuidelines.length > 0 || aiResponse.drugInfo.length > 0 || aiResponse.differentialDiagnosis.length > 0 || aiResponse.labTests.length > 0)) {
      // Merge AI refs with local refs for completeness
      const mergedRefs = [...(aiResponse.references || []), ...(localResponse.references || [])]
        .filter((r, i, a) => a.findIndex(x => x.title === r.title) === i)
        .slice(0, 8);
      return {
        ...aiResponse,
        references: mergedRefs,
        summary: `🤖 AI Analysis\n\n${aiResponse.summary}`
      };
    }
  } catch {
    // AI failed, use local
  }
  
  return localResponse;
};

// Local CDSS response generator (fast, no network)
const generateLocalCDSSResponse = (query: string, _category: string, _specialty: string): CDSSResponse => {
  console.log('[CDSS] Using local knowledge base');
  
  // Generate contextual response based on query
  const lowerQuery = query.toLowerCase();
  
  // Clinical Guidelines based on query
  const guidelines: ClinicalGuideline[] = [];
  const drugs: DrugInformation[] = [];
  const differentials: DifferentialDiagnosis[] = [];
  const labTests: LabTest[] = [];
  const references: MedicalReference[] = [];
  const warnings: ClinicalWarning[] = [];
  const icdCodes: ICD10Code[] = [];
  
  // Hypertension related
  if (lowerQuery.includes('hypertension') || lowerQuery.includes('blood pressure') || lowerQuery.includes('bp')) {
    guidelines.push(
      {
        title: 'Management of Hypertension in Adults',
        source: 'NICE Guidelines NG136',
        sourceType: 'NICE',
        recommendation: 'Start antihypertensive treatment if clinic BP ≥140/90 mmHg and ABPM/HBPM ≥135/85 mmHg. Consider ACE inhibitor or ARB for patients <55 years; CCB for ≥55 years or Black African/Caribbean origin.',
        evidenceLevel: 'A',
        url: 'https://www.nice.org.uk/guidance/ng136'
      },
      {
        title: 'JNC 8 Guidelines for Hypertension',
        source: 'JAMA',
        sourceType: 'JAMA',
        recommendation: 'In patients ≥60 years, initiate treatment at SBP ≥150 or DBP ≥90. Target <150/90. For <60 years, target <140/90.',
        evidenceLevel: 'A',
        url: 'https://jamanetwork.com/journals/jama/fullarticle/1791497'
      },
      {
        title: 'Indian Guidelines on Hypertension (IGH-IV)',
        source: 'JAPI',
        sourceType: 'IJMR',
        recommendation: 'For Indian population, consider lower BMI thresholds. ARBs preferred in diabetic patients. Target BP <130/80 in high-risk patients.',
        evidenceLevel: 'B',
        url: 'https://www.japi.org'
      }
    );
    
    drugs.push(
      {
        name: 'Amlodipine',
        genericName: 'Amlodipine Besylate',
        drugClass: 'Calcium Channel Blocker (Dihydropyridine)',
        indications: ['Hypertension', 'Chronic stable angina', 'Vasospastic angina'],
        dosage: '5-10 mg once daily. Start with 5mg, may increase to 10mg after 7-14 days.',
        contraindications: ['Severe aortic stenosis', 'Cardiogenic shock', 'Unstable angina'],
        sideEffects: ['Peripheral edema', 'Flushing', 'Headache', 'Fatigue', 'Dizziness'],
        interactions: ['CYP3A4 inhibitors increase levels', 'Simvastatin - limit to 20mg'],
        pregnancyCategory: 'C',
        source: 'BMJ Best Practice'
      },
      {
        name: 'Telmisartan',
        genericName: 'Telmisartan',
        drugClass: 'Angiotensin II Receptor Blocker (ARB)',
        indications: ['Hypertension', 'CV risk reduction in high-risk patients'],
        dosage: '40-80 mg once daily. Start with 40mg.',
        contraindications: ['Pregnancy', 'Bilateral renal artery stenosis', 'Hyperkalemia'],
        sideEffects: ['Dizziness', 'Upper respiratory infection', 'Back pain', 'Diarrhea'],
        interactions: ['NSAIDs reduce effect', 'Potassium-sparing diuretics - hyperkalemia risk'],
        pregnancyCategory: 'D',
        source: 'UpToDate'
      }
    );
    
    differentials.push(
      {
        condition: 'Essential (Primary) Hypertension',
        probability: 'High',
        keyFeatures: ['No identifiable cause', '90-95% of cases', 'Family history', 'Age >40'],
        rulingOutTests: ['Renal function tests', 'Urinalysis', 'Lipid profile']
      },
      {
        condition: 'Secondary Hypertension - Renal',
        probability: 'Moderate',
        keyFeatures: ['Young onset (<30)', 'Resistant to treatment', 'Abnormal urinalysis'],
        rulingOutTests: ['Renal artery Doppler', 'Serum creatinine', '24h urine protein']
      },
      {
        condition: 'Pheochromocytoma',
        probability: 'Low',
        keyFeatures: ['Paroxysmal episodes', 'Headache, palpitations, sweating', 'Labile BP'],
        rulingOutTests: ['24h urine metanephrines', 'Plasma metanephrines', 'CT/MRI adrenals']
      }
    );
    
    labTests.push(
      { name: 'Serum Creatinine', purpose: 'Assess renal function', normalRange: '0.7-1.3 mg/dL', interpretation: 'Elevated suggests renal involvement or secondary cause' },
      { name: 'Serum Potassium', purpose: 'Rule out hyperaldosteronism', normalRange: '3.5-5.0 mEq/L', interpretation: 'Low K+ may suggest primary aldosteronism' },
      { name: 'Fasting Lipid Profile', purpose: 'CV risk assessment', normalRange: 'LDL <100 mg/dL ideal', interpretation: 'Elevated lipids increase CV risk' },
      { name: 'HbA1c', purpose: 'Screen for diabetes', normalRange: '<5.7%', interpretation: '5.7-6.4% prediabetes, ≥6.5% diabetes' }
    );
    
    icdCodes.push(
      { code: 'I10', description: 'Essential (primary) hypertension', category: 'Hypertensive diseases' },
      { code: 'I11.9', description: 'Hypertensive heart disease without heart failure', category: 'Hypertensive diseases' },
      { code: 'I12.9', description: 'Hypertensive chronic kidney disease', category: 'Hypertensive diseases' }
    );
    
    warnings.push(
      { type: 'warning', message: 'Monitor renal function when starting ACE inhibitors/ARBs', action: 'Check creatinine at 1-2 weeks' },
      { type: 'info', message: 'Consider home BP monitoring for better assessment', action: 'Provide patient education' }
    );
  }
  
  // Diabetes related
  if (lowerQuery.includes('diabetes') || lowerQuery.includes('sugar') || lowerQuery.includes('hba1c') || lowerQuery.includes('glucose')) {
    guidelines.push(
      {
        title: 'Standards of Medical Care in Diabetes',
        source: 'American Diabetes Association',
        sourceType: 'NEJM',
        recommendation: 'HbA1c target <7% for most adults. Metformin first-line unless contraindicated. Consider SGLT2 inhibitors or GLP-1 agonists in patients with CVD or CKD.',
        evidenceLevel: 'A',
        url: 'https://diabetesjournals.org/care'
      },
      {
        title: 'Type 2 Diabetes Management',
        source: 'BMJ Best Practice',
        sourceType: 'BMJ',
        recommendation: 'Lifestyle modification is cornerstone. Start metformin at diagnosis. Add second agent if HbA1c >7% after 3 months on metformin.',
        evidenceLevel: 'A',
        url: 'https://bestpractice.bmj.com'
      },
      {
        title: 'RSSDI Clinical Practice Recommendations',
        source: 'Research Society for Study of Diabetes in India',
        sourceType: 'IJMR',
        recommendation: 'For Indian patients, consider lower BMI cutoffs (≥23 for overweight). Early combination therapy may be beneficial in high HbA1c.',
        evidenceLevel: 'B',
        url: 'https://rssdi.in'
      }
    );
    
    drugs.push(
      {
        name: 'Metformin',
        genericName: 'Metformin Hydrochloride',
        drugClass: 'Biguanide',
        indications: ['Type 2 Diabetes Mellitus', 'Prediabetes', 'PCOS'],
        dosage: 'Start 500mg BD with meals, increase gradually. Max 2000-2550mg/day in divided doses.',
        contraindications: ['eGFR <30 mL/min', 'Acute/chronic metabolic acidosis', 'Contrast procedures'],
        sideEffects: ['GI upset', 'Nausea', 'Diarrhea', 'B12 deficiency (long-term)'],
        interactions: ['Alcohol increases lactic acidosis risk', 'Hold before contrast'],
        pregnancyCategory: 'B',
        source: 'ADA Guidelines'
      },
      {
        name: 'Empagliflozin',
        genericName: 'Empagliflozin',
        drugClass: 'SGLT2 Inhibitor',
        indications: ['Type 2 DM', 'Heart failure with reduced EF', 'CKD'],
        dosage: '10mg once daily, may increase to 25mg.',
        contraindications: ['Type 1 DM', 'Dialysis', 'eGFR <20 for glycemic use'],
        sideEffects: ['UTI', 'Genital mycotic infections', 'Volume depletion', 'Rare: DKA'],
        interactions: ['Diuretics - volume depletion risk', 'Insulin - hypoglycemia'],
        pregnancyCategory: 'D',
        source: 'EMPA-REG OUTCOME Trial'
      }
    );
    
    icdCodes.push(
      { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'Diabetes mellitus' },
      { code: 'E11.65', description: 'Type 2 DM with hyperglycemia', category: 'Diabetes mellitus' },
      { code: 'E11.22', description: 'Type 2 DM with diabetic CKD', category: 'Diabetes mellitus' }
    );
  }
  
  // Chest pain / ACS
  if (lowerQuery.includes('chest pain') || lowerQuery.includes('mi') || lowerQuery.includes('acs') || lowerQuery.includes('stemi')) {
    guidelines.push(
      {
        title: 'ACS NSTEMI/Unstable Angina Management',
        source: 'ESC Guidelines 2023',
        sourceType: 'BMJ',
        recommendation: 'Risk stratify using GRACE score. Dual antiplatelet therapy (Aspirin + P2Y12 inhibitor). Early invasive strategy in high-risk patients within 24h.',
        evidenceLevel: 'A',
        url: 'https://www.escardio.org/Guidelines'
      },
      {
        title: 'STEMI Management',
        source: 'ACC/AHA Guidelines',
        sourceType: 'JAMA',
        recommendation: 'Primary PCI within 90 minutes of first medical contact. If PCI not available within 120 min, consider fibrinolysis within 30 min.',
        evidenceLevel: 'A',
        url: 'https://www.acc.org/guidelines'
      }
    );
    
    differentials.push(
      {
        condition: 'Acute Coronary Syndrome',
        probability: 'High',
        keyFeatures: ['Chest pressure/tightness', 'Radiation to arm/jaw', 'Diaphoresis', 'Risk factors'],
        rulingOutTests: ['Serial Troponins (0, 3, 6h)', 'ECG', 'Echocardiogram']
      },
      {
        condition: 'Pulmonary Embolism',
        probability: 'Moderate',
        keyFeatures: ['Pleuritic chest pain', 'Dyspnea', 'Tachycardia', 'Recent immobilization'],
        rulingOutTests: ['D-dimer', 'CT Pulmonary Angiogram', 'Wells Score']
      },
      {
        condition: 'Aortic Dissection',
        probability: 'Low',
        keyFeatures: ['Tearing chest pain', 'Back pain', 'BP differential', 'Marfan syndrome'],
        rulingOutTests: ['CT Aortogram', 'TEE', 'Chest X-ray (widened mediastinum)']
      }
    );
    
    warnings.push(
      { type: 'critical', message: 'Time-critical condition! Door-to-balloon <90 min for STEMI', action: 'Activate cath lab immediately' },
      { type: 'warning', message: 'Do not delay reperfusion for diagnostic workup', action: 'Parallel processing of tests and treatment' }
    );
  }
  
  // Guillain-Barré Syndrome (GBS)
  if (lowerQuery.includes('guillain') || lowerQuery.includes('gbs') || lowerQuery.includes('ascending paralysis') || lowerQuery.includes('acute inflammatory demyelinating')) {
    guidelines.push(
      {
        title: 'Guillain-Barré Syndrome Diagnosis and Management',
        source: 'Neurology Clinical Practice Guidelines',
        sourceType: 'NEJM',
        recommendation: 'Diagnosis based on clinical features: progressive bilateral weakness, areflexia, CSF albuminocytologic dissociation. EMG/NCS for confirmation. Treat with IVIG 0.4g/kg/day for 5 days OR plasmapheresis (5 exchanges over 2 weeks).',
        evidenceLevel: 'A',
        url: 'https://www.nejm.org/doi/full/10.1056/NEJMra1114525'
      },
      {
        title: 'European Academy of Neurology GBS Guidelines',
        source: 'European Academy of Neurology',
        sourceType: 'Lancet',
        recommendation: 'Monitor respiratory function closely (FVC). Consider ICU if FVC <20 mL/kg or declining >30%. IVIG and PE equally effective. Do not use corticosteroids alone.',
        evidenceLevel: 'A',
        url: 'https://www.ean.org/guidelines'
      },
      {
        title: 'Indian Guidelines on GBS Management',
        source: 'Indian Academy of Neurology',
        sourceType: 'IJMR',
        recommendation: 'In resource-limited settings, PE may be more cost-effective. Monitor for autonomic dysfunction. Early rehabilitation crucial for recovery.',
        evidenceLevel: 'B',
        url: 'https://www.ijmr.org.in'
      }
    );
    
    drugs.push(
      {
        name: 'Intravenous Immunoglobulin (IVIG)',
        genericName: 'Human Immunoglobulin',
        drugClass: 'Immunomodulator',
        indications: ['Guillain-Barré Syndrome', 'CIDP', 'Myasthenia Gravis', 'Primary immunodeficiency'],
        dosage: '0.4 g/kg/day IV for 5 consecutive days (total 2 g/kg)',
        contraindications: ['IgA deficiency with anti-IgA antibodies', 'Hypersensitivity to immunoglobulins'],
        sideEffects: ['Headache', 'Fever', 'Chills', 'Aseptic meningitis', 'Renal dysfunction', 'Thrombosis'],
        interactions: ['Live vaccines - avoid for 3 months after IVIG', 'May interfere with some lab tests'],
        pregnancyCategory: 'C',
        source: 'Cochrane Review'
      }
    );
    
    differentials.push(
      {
        condition: 'Guillain-Barré Syndrome (AIDP)',
        probability: 'High',
        keyFeatures: ['Ascending weakness', 'Areflexia', 'Recent infection (1-4 weeks prior)', 'Sensory symptoms', 'Facial weakness'],
        rulingOutTests: ['CSF analysis (high protein, normal cells)', 'EMG/NCS', 'MRI spine to rule out cord compression']
      },
      {
        condition: 'Transverse Myelitis',
        probability: 'Moderate',
        keyFeatures: ['Sensory level', 'Bowel/bladder dysfunction early', 'Back pain', 'MRI cord lesion'],
        rulingOutTests: ['MRI spine with contrast', 'CSF oligoclonal bands', 'NMO-IgG']
      },
      {
        condition: 'Myasthenia Gravis',
        probability: 'Low',
        keyFeatures: ['Fatigable weakness', 'Ptosis', 'Diplopia', 'Bulbar symptoms predominant'],
        rulingOutTests: ['Anti-AChR antibodies', 'Anti-MuSK antibodies', 'Repetitive nerve stimulation']
      },
      {
        condition: 'Botulism',
        probability: 'Low',
        keyFeatures: ['Descending paralysis', 'Pupil dilation', 'Food exposure history', 'Autonomic symptoms'],
        rulingOutTests: ['Stool/serum botulinum toxin assay', 'EMG (incremental response)']
      }
    );
    
    labTests.push(
      { name: 'CSF Analysis (Lumbar Puncture)', purpose: 'Confirm albuminocytologic dissociation', normalRange: 'Protein <45 mg/dL, WBC <5/mm³', interpretation: 'High protein (>45 mg/dL) with normal WBC supports GBS. May be normal in first week.' },
      { name: 'EMG/Nerve Conduction Studies', purpose: 'Confirm demyelinating neuropathy', normalRange: 'Normal conduction velocities', interpretation: 'Prolonged distal latencies, conduction block, F-wave abnormalities in AIDP' },
      { name: 'Forced Vital Capacity (FVC)', purpose: 'Monitor respiratory function', normalRange: '>60 mL/kg', interpretation: 'FVC <20 mL/kg or declining >30% = consider intubation' },
      { name: 'Anti-ganglioside Antibodies', purpose: 'Identify GBS variants', normalRange: 'Negative', interpretation: 'Anti-GQ1b in Miller Fisher; Anti-GM1 in AMAN variant' }
    );
    
    icdCodes.push(
      { code: 'G61.0', description: 'Guillain-Barré syndrome', category: 'Inflammatory polyneuropathy' },
      { code: 'G61.81', description: 'Chronic inflammatory demyelinating polyneuropathy (CIDP)', category: 'Inflammatory polyneuropathy' }
    );
    
    warnings.push(
      { type: 'critical', message: 'Monitor respiratory function every 2-4 hours! Rapid deterioration possible.', action: 'Check FVC, NIF. ICU if FVC <20 mL/kg or declining rapidly' },
      { type: 'warning', message: 'Autonomic dysfunction can cause arrhythmias and BP instability', action: 'Continuous cardiac monitoring in acute phase' },
      { type: 'info', message: '70-80% of patients recover with minimal disability. Peak disability usually at 2-4 weeks.', action: 'Early physiotherapy and rehabilitation' }
    );
  }
  
  // COPD
  if (lowerQuery.includes('copd') || lowerQuery.includes('chronic obstructive') || lowerQuery.includes('emphysema')) {
    guidelines.push(
      {
        title: 'GOLD 2024 COPD Guidelines',
        source: 'Global Initiative for COPD',
        sourceType: 'BMJ',
        recommendation: 'Classify using ABE assessment. LAMA or LABA for Group A. LAMA+LABA for Group B. ICS+LABA+LAMA triple therapy for Group E with eosinophils ≥300.',
        evidenceLevel: 'A',
        url: 'https://goldcopd.org'
      }
    );
    
    drugs.push(
      {
        name: 'Tiotropium',
        genericName: 'Tiotropium Bromide',
        drugClass: 'Long-acting Muscarinic Antagonist (LAMA)',
        indications: ['COPD maintenance', 'Asthma (add-on)'],
        dosage: '18 mcg once daily via dry powder inhaler',
        contraindications: ['Hypersensitivity to atropine derivatives', 'Narrow-angle glaucoma'],
        sideEffects: ['Dry mouth', 'Constipation', 'Urinary retention', 'Blurred vision'],
        interactions: ['Other anticholinergics - additive effects'],
        pregnancyCategory: 'C',
        source: 'GOLD Guidelines'
      }
    );
    
    icdCodes.push(
      { code: 'J44.1', description: 'COPD with acute exacerbation', category: 'Chronic lower respiratory diseases' },
      { code: 'J44.9', description: 'COPD, unspecified', category: 'Chronic lower respiratory diseases' }
    );
  }
  
  // Pneumonia
  if (lowerQuery.includes('pneumonia') || lowerQuery.includes('cap') || lowerQuery.includes('community acquired')) {
    guidelines.push(
      {
        title: 'Community-Acquired Pneumonia Guidelines',
        source: 'ATS/IDSA Guidelines 2019',
        sourceType: 'NEJM',
        recommendation: 'Outpatient: Amoxicillin OR Doxycycline OR Macrolide. Inpatient non-ICU: β-lactam + Macrolide OR Respiratory fluoroquinolone. ICU: β-lactam + Macrolide + consider MRSA coverage.',
        evidenceLevel: 'A',
        url: 'https://www.thoracic.org/statements/cap.php'
      }
    );
    
    drugs.push(
      {
        name: 'Amoxicillin-Clavulanate',
        genericName: 'Amoxicillin/Clavulanic Acid',
        drugClass: 'Beta-lactam/Beta-lactamase inhibitor',
        indications: ['CAP', 'Sinusitis', 'UTI', 'Skin infections'],
        dosage: '625mg TDS or 1g BD for 5-7 days',
        contraindications: ['Penicillin allergy', 'History of cholestatic jaundice with amox-clav'],
        sideEffects: ['Diarrhea', 'Nausea', 'Rash', 'Candidiasis'],
        interactions: ['Warfarin - increased INR', 'Methotrexate - increased toxicity'],
        pregnancyCategory: 'B',
        source: 'IDSA Guidelines'
      }
    );
    
    labTests.push(
      { name: 'Chest X-ray', purpose: 'Confirm pneumonia', normalRange: 'Clear lung fields', interpretation: 'Consolidation, infiltrates indicate pneumonia' },
      { name: 'Procalcitonin', purpose: 'Differentiate bacterial vs viral', normalRange: '<0.1 ng/mL', interpretation: '>0.25 suggests bacterial infection' }
    );
    
    icdCodes.push(
      { code: 'J18.9', description: 'Pneumonia, unspecified organism', category: 'Pneumonia' },
      { code: 'J15.9', description: 'Bacterial pneumonia, unspecified', category: 'Pneumonia' }
    );
  }
  
  // Stroke / CVA
  if (lowerQuery.includes('stroke') || lowerQuery.includes('cva') || lowerQuery.includes('cerebrovascular') || lowerQuery.includes('tia')) {
    guidelines.push(
      {
        title: 'AHA/ASA Acute Ischemic Stroke Guidelines',
        source: 'American Heart Association',
        sourceType: 'JAMA',
        recommendation: 'IV alteplase within 4.5 hours of onset if eligible. Mechanical thrombectomy within 24 hours for LVO. Admit to stroke unit. Aspirin within 24-48 hours.',
        evidenceLevel: 'A',
        url: 'https://www.stroke.org/guidelines'
      }
    );
    
    warnings.push(
      { type: 'critical', message: 'TIME IS BRAIN! Every minute counts. Door-to-needle <60 min target.', action: 'Activate stroke code immediately' },
      { type: 'warning', message: 'Rule out hemorrhage before thrombolysis', action: 'STAT CT head before any intervention' }
    );
    
    icdCodes.push(
      { code: 'I63.9', description: 'Cerebral infarction, unspecified', category: 'Cerebrovascular diseases' },
      { code: 'G45.9', description: 'Transient cerebral ischemic attack, unspecified', category: 'Episodic and paroxysmal disorders' }
    );
  }
  
  // Sepsis
  if (lowerQuery.includes('sepsis') || lowerQuery.includes('septic shock') || lowerQuery.includes('sirs')) {
    guidelines.push(
      {
        title: 'Surviving Sepsis Campaign 2021',
        source: 'Society of Critical Care Medicine',
        sourceType: 'NEJM',
        recommendation: 'Hour-1 Bundle: Measure lactate, obtain blood cultures, administer broad-spectrum antibiotics, begin rapid fluid resuscitation (30 mL/kg crystalloid for hypotension or lactate ≥4). Vasopressors if hypotensive during/after fluid resuscitation.',
        evidenceLevel: 'A',
        url: 'https://www.sccm.org/SurvivingSepsisCampaign'
      }
    );
    
    warnings.push(
      { type: 'critical', message: 'Sepsis is a medical emergency! Each hour delay in antibiotics increases mortality.', action: 'Start antibiotics within 1 hour of recognition' }
    );
    
    labTests.push(
      { name: 'Serum Lactate', purpose: 'Assess tissue perfusion', normalRange: '<2 mmol/L', interpretation: '≥4 mmol/L indicates severe sepsis/shock. Re-measure if initial >2.' },
      { name: 'Procalcitonin', purpose: 'Bacterial infection marker', normalRange: '<0.1 ng/mL', interpretation: '>0.5 strongly suggests bacterial infection' }
    );
    
    icdCodes.push(
      { code: 'A41.9', description: 'Sepsis, unspecified organism', category: 'Sepsis' },
      { code: 'R65.21', description: 'Severe sepsis with septic shock', category: 'Sepsis' }
    );
  }
  
  // Asthma
  if (lowerQuery.includes('asthma') || lowerQuery.includes('wheez') || lowerQuery.includes('bronchospasm')) {
    guidelines.push(
      {
        title: 'GINA 2024 Asthma Guidelines',
        source: 'Global Initiative for Asthma',
        sourceType: 'Lancet',
        recommendation: 'Step 1-2: As-needed ICS-formoterol. Step 3: Low-dose ICS-LABA maintenance + as-needed. Step 4: Medium-dose ICS-LABA. Step 5: Add-on LAMA, biologics for severe asthma.',
        evidenceLevel: 'A',
        url: 'https://ginasthma.org'
      }
    );
    
    drugs.push(
      {
        name: 'Budesonide-Formoterol',
        genericName: 'Budesonide/Formoterol Fumarate',
        drugClass: 'ICS-LABA combination',
        indications: ['Asthma maintenance and reliever', 'COPD'],
        dosage: '200/6 mcg - 1-2 puffs BD maintenance; may use as reliever',
        contraindications: ['Primary treatment of acute asthma attack'],
        sideEffects: ['Oral candidiasis', 'Hoarseness', 'Tremor', 'Palpitations'],
        interactions: ['Beta-blockers - reduced bronchodilation', 'CYP3A4 inhibitors - increased corticosteroid exposure'],
        pregnancyCategory: 'C',
        source: 'GINA Guidelines'
      }
    );
    
    icdCodes.push(
      { code: 'J45.20', description: 'Mild intermittent asthma, uncomplicated', category: 'Asthma' },
      { code: 'J45.901', description: 'Unspecified asthma with acute exacerbation', category: 'Asthma' }
    );
  }
  
  // Fallback: If no specific condition matched, provide general guidance
  if (guidelines.length === 0 && differentials.length === 0) {
    // Add a general info message
    warnings.push({
      type: 'info',
      message: `No specific guidelines found for "${query}". Showing general resources. Upload medical encyclopedias via Knowledge Base for more comprehensive results.`,
      action: 'Click "Knowledge Base" button to upload Gale Encyclopedia or other medical PDFs'
    });
    
    // Add general clinical approach
    guidelines.push({
      title: 'General Clinical Assessment Approach',
      source: 'Clinical Practice Standards',
      sourceType: 'BMJ',
      recommendation: 'For any clinical presentation: 1) Take detailed history including onset, duration, severity, associated symptoms. 2) Perform systematic physical examination. 3) Order relevant investigations based on clinical suspicion. 4) Consider common and serious differential diagnoses. 5) Document findings and clinical reasoning.',
      evidenceLevel: 'Expert Opinion'
    });
    
    // Suggest using external resources
    references.push({
      title: `Search for: ${query}`,
      authors: 'UpToDate Clinical Database',
      journal: 'UpToDate',
      year: 2024,
      url: `https://www.uptodate.com/contents/search?search=${encodeURIComponent(query)}`,
      abstract: 'Access comprehensive clinical information on UpToDate.'
    });
    
    references.push({
      title: `PubMed Search: ${query}`,
      authors: 'National Library of Medicine',
      journal: 'PubMed',
      year: 2024,
      url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`,
      abstract: 'Search peer-reviewed medical literature on PubMed.'
    });
  }
  
  // Add common references
  references.push(
    {
      title: 'Evidence-Based Medicine in Clinical Practice',
      authors: 'Various Authors',
      journal: 'British Medical Journal',
      year: 2024,
      url: 'https://www.bmj.com',
      abstract: 'Latest clinical evidence and guidelines from BMJ.'
    },
    {
      title: 'Clinical Practice Guidelines Database',
      authors: 'Medical Consortium',
      journal: 'New England Journal of Medicine',
      year: 2024,
      url: 'https://www.nejm.org',
      abstract: 'Comprehensive guidelines from NEJM.'
    },
    {
      title: 'Indian Medical Guidelines Compendium',
      authors: 'ICMR',
      journal: 'Indian Journal of Medical Research',
      year: 2024,
      url: 'https://www.ijmr.org.in',
      abstract: 'Guidelines adapted for Indian population and healthcare settings.'
    },
    {
      title: 'Medical Encyclopedia Entry',
      authors: 'Wikipedia Contributors',
      journal: 'Wikipedia Medical',
      year: 2024,
      url: 'https://en.wikipedia.org/wiki/Medicine',
      abstract: 'Community-maintained medical encyclopedia. Use for reference only.'
    }
  );
  
  // Generate summary
  const summary = generateSummary(query, guidelines, drugs);
  
  return {
    summary,
    clinicalGuidelines: guidelines,
    drugInfo: drugs,
    differentialDiagnosis: differentials,
    labTests,
    references,
    warnings,
    icd10Codes: icdCodes
  };
};

const generateSummary = (query: string, guidelines: ClinicalGuideline[], drugs: DrugInformation[]): string => {
  const parts = [];
  
  parts.push(`Based on your query "${query}", here is a clinical decision support summary:\n`);
  
  // Count Gale Encyclopedia entries
  const galeEntries = guidelines.filter(g => g.source === 'Gale Encyclopedia of Medicine').length;
  const otherGuidelines = guidelines.length - galeEntries;
  
  if (galeEntries > 0) {
    parts.push(`📕 ${galeEntries} entries found from Gale Encyclopedia of Medicine.`);
  }
  
  if (otherGuidelines > 0) {
    const sources = guidelines.filter(g => g.source !== 'Gale Encyclopedia of Medicine').map(g => g.sourceType).filter((v, i, a) => a.indexOf(v) === i);
    parts.push(`📋 ${otherGuidelines} clinical guidelines from ${sources.join(', ')}.`);
  }
  
  if (drugs.length > 0) {
    parts.push(`💊 ${drugs.length} relevant medications identified: ${drugs.map(d => d.name).join(', ')}.`);
  }
  
  parts.push('\nPlease review the detailed information below and apply clinical judgment for patient-specific decisions.');
  
  return parts.join('\n');
};

// ==========================================
// COMPONENTS
// ==========================================

// Clinical Warning Component
const ClinicalWarningCard = ({ warning }: { warning: ClinicalWarning }) => {
  const config = {
    critical: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-500', icon: AlertTriangle, iconColor: 'text-red-500' },
    warning: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-500', icon: AlertCircle, iconColor: 'text-amber-500' },
    info: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-500', icon: Info, iconColor: 'text-blue-500' }
  };
  
  const { bg, border, icon: Icon, iconColor } = config[warning.type];
  
  return (
    <div className={cn("p-3 rounded-lg border-l-4", bg, border)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("h-5 w-5 mt-0.5", iconColor)} />
        <div>
          <p className="font-medium text-sm">{warning.message}</p>
          {warning.action && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">Action:</span> {warning.action}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Drug Card Component
const DrugCard = ({ drug }: { drug: DrugInformation }) => (
  <Card className="bg-white dark:bg-slate-800/50">
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pill className="h-5 w-5 text-teal-500" />
            {drug.name || 'Unknown Drug'}
          </CardTitle>
          <CardDescription>{drug.genericName || 'N/A'} • {drug.drugClass || 'N/A'}</CardDescription>
        </div>
        {drug.pregnancyCategory && (
          <Badge className={cn(
            drug.pregnancyCategory === 'A' || drug.pregnancyCategory === 'B' ? 'bg-green-100 text-green-700' :
            drug.pregnancyCategory === 'C' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          )}>
            Pregnancy Cat. {drug.pregnancyCategory}
          </Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {drug.dosage && (
        <div>
          <h4 className="text-sm font-semibold text-teal-600 dark:text-teal-400 mb-1">Dosage</h4>
          <p className="text-sm bg-teal-50 dark:bg-teal-950/30 p-2 rounded">{drug.dosage}</p>
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <h4 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-1">Indications</h4>
          <ul className="text-xs space-y-0.5">
            {(drug.indications || []).length > 0 ? (
              drug.indications.map((ind, i) => (
                <li key={i} className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {ind}
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No indications available</li>
            )}
          </ul>
        </div>
        
        <div>
          <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Contraindications</h4>
          <ul className="text-xs space-y-0.5">
            {(drug.contraindications || []).length > 0 ? (
              drug.contraindications.slice(0, 3).map((contra, i) => (
                <li key={i} className="flex items-center gap-1">
                  <X className="h-3 w-3 text-red-500" />
                  {contra}
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No contraindications listed</li>
            )}
          </ul>
        </div>
      </div>
      
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="details" className="border-0">
          <AccordionTrigger className="text-sm py-2">More Details</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div>
                <h5 className="text-xs font-semibold text-amber-600">Side Effects</h5>
                <p className="text-xs text-muted-foreground">
                  {(drug.sideEffects || []).length > 0 ? drug.sideEffects.join(', ') : 'No side effects listed'}
                </p>
              </div>
              <div>
                <h5 className="text-xs font-semibold text-purple-600">Interactions</h5>
                <p className="text-xs text-muted-foreground">
                  {(drug.interactions || []).length > 0 ? drug.interactions.join(', ') : 'No interactions listed'}
                </p>
              </div>
              {drug.source && (
                <p className="text-[10px] text-muted-foreground italic">Source: {drug.source}</p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </CardContent>
  </Card>
);

// Guideline Card Component
const GuidelineCard = ({ guideline }: { guideline: ClinicalGuideline }) => {
  const evidenceColors = {
    'A': 'bg-green-500',
    'B': 'bg-blue-500',
    'C': 'bg-amber-500',
    'D': 'bg-orange-500',
    'Expert Opinion': 'bg-purple-500'
  };
  
  const sourceIcons: Record<string, string> = {
    'BMJ': '🇬🇧',
    'NEJM': '🇺🇸',
    'Lancet': '🇬🇧',
    'JAMA': '🇺🇸',
    'IJMR': '🇮🇳',
    'WHO': '🌐',
    'CDC': '🇺🇸',
    'NICE': '🇬🇧',
    'UpToDate': '📚',
    'Wikipedia': '📖'
  };
  
  return (
    <Card className="bg-white dark:bg-slate-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-500" />
            {guideline.title}
          </CardTitle>
          <Badge className={cn("text-white text-xs", evidenceColors[guideline.evidenceLevel])}>
            Level {guideline.evidenceLevel}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-2">
          <span>{sourceIcons[guideline.sourceType] || '📄'}</span>
          {guideline.source}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{guideline.recommendation}</p>
        {guideline.url && (
          <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
            <a href={guideline.url} target="_blank" rel="noopener noreferrer">
              View Source <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

// Differential Diagnosis Card
const DifferentialCard = ({ differential }: { differential: DifferentialDiagnosis }) => {
  const probColors: Record<string, string> = {
    'High': 'bg-red-100 text-red-700 border-red-300',
    'Moderate': 'bg-amber-100 text-amber-700 border-amber-300',
    'Low': 'bg-green-100 text-green-700 border-green-300'
  };
  
  const probability = differential.probability || 'Moderate';
  
  return (
    <Card className="bg-white dark:bg-slate-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{differential.condition || 'Unknown Condition'}</CardTitle>
          <Badge className={cn("border", probColors[probability] || probColors['Moderate'])}>
            {probability} Probability
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-1">Key Features</h4>
          <div className="flex flex-wrap gap-1">
            {(differential.keyFeatures || []).length > 0 ? (
              differential.keyFeatures.map((feature, i) => (
                <Badge key={i} variant="outline" className="text-xs">{feature}</Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No key features listed</span>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-1">Ruling Out Tests</h4>
          <p className="text-xs">
            {(differential.rulingOutTests || []).length > 0 
              ? differential.rulingOutTests.join(', ') 
              : 'No ruling out tests specified'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

const DoctorAssist = () => {
  const navigate = useNavigate();
  const { currentDoctor, userType } = useAuth();
  const { toast } = useToast();
  
  // Ring-fencing: Redirect non-doctor users
  useEffect(() => {
    const storedUserType = localStorage.getItem('userType');
    const doctorToken = localStorage.getItem('doctorToken');
    
    // If not a doctor, redirect to appropriate page
    if (storedUserType !== 'doctor' && userType !== 'doctor' && !doctorToken) {
      console.log('[DoctorAssist] Non-doctor user detected, redirecting...');
      if (storedUserType === 'user' || !storedUserType) {
        navigate('/', { replace: true });
      } else if (storedUserType === 'clinic') {
        navigate('/clinic/dashboard', { replace: true });
      } else {
        navigate('/doctor/login', { replace: true });
      }
    }
  }, [userType, navigate]);
  
  // State
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('diagnosis');
  const [selectedSpecialty, setSelectedSpecialty] = useState('general');
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState<CDSSResponse | null>(null);
  const [queryHistory, setQueryHistory] = useState<MedicalQuery[]>([]);
  const [activeTab, setActiveTab] = useState('guidelines');
  const [selectedSources, setSelectedSources] = useState<string[]>(['gale', 'bmj', 'nejm', 'ijmr', 'nice', 'who']);
  const [showSourceFilter, setShowSourceFilter] = useState(false);
  const [knowledgeStats, setKnowledgeStats] = useState<{ total_entries: number; unique_sources: number; sources: string[] }>({ total_entries: 0, unique_sources: 0, sources: [] });
  const [cdssHealth, setCdssHealth] = useState<{ status: string; providers: { sib: boolean; groq: boolean; knowledgeBase: boolean }; lastCheck?: string } | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [showKnowledgeUpload, setShowKnowledgeUpload] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load knowledge base stats on mount
  useEffect(() => {
    getKnowledgeStats().then(stats => setKnowledgeStats(stats));
  }, []);

  const refreshCDSSHealth = useCallback(async () => {
    setIsHealthLoading(true);
    try {
      const response = await api.get('/cdss/knowledge/health');
      setCdssHealth(response.data);
    } catch (error) {
      console.warn('[CDSS] Health check failed:', error);
      setCdssHealth(null);
    } finally {
      setIsHealthLoading(false);
    }
  }, []);

  // Load CDSS health on mount
  useEffect(() => {
    refreshCDSSHealth();
  }, [refreshCDSSHealth]);
  
  // Handle PDF upload for knowledge base
  const handlePDFUpload = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      toast({ title: "Invalid file", description: "Please select a PDF file", variant: "destructive" });
      return;
    }
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'gale_encyclopedia');
      formData.append('category', 'medical_encyclopedia');
      formData.append('title', file.name.replace('.pdf', ''));
      
      const response = await api.post('/cdss/knowledge/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast({
        title: "📕 Knowledge Ingested",
        description: response.data.message || `Successfully processed ${response.data.chunksIngested} chunks`
      });
      
      // Refresh stats
      const stats = await getKnowledgeStats();
      setKnowledgeStats(stats);
      setShowKnowledgeUpload(false);
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error?.response?.data?.error || "Failed to process PDF",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Quick Queries
  const quickQueries = [
    'Hypertension management in diabetic patient',
    'STEMI treatment protocol',
    'Drug interactions with warfarin',
    'Pediatric fever workup',
    'COPD exacerbation treatment',
    'Diabetic ketoacidosis management'
  ];
  
  // Handle Query Submission
  const handleSubmit = async () => {
    if (!query.trim()) {
      toast({ title: "Enter a query", variant: "destructive" });
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await generateCDSSResponse(query, selectedCategory, selectedSpecialty);
      setCurrentResponse(response);
      
      // Add to history
      const newQuery: MedicalQuery = {
        id: `q-${Date.now()}`,
        query: query.trim(),
        category: selectedCategory,
        timestamp: new Date(),
        response,
        isFavorite: false
      };
      setQueryHistory(prev => [newQuery, ...prev].slice(0, 50));
      
      toast({
        title: "✅ Analysis Complete",
        description: `Found ${response.clinicalGuidelines.length} guidelines, ${response.drugInfo.length} medications`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch clinical information",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Toggle source filter
  const toggleSource = (sourceId: string) => {
    setSelectedSources(prev => 
      prev.includes(sourceId) 
        ? prev.filter(s => s !== sourceId)
        : [...prev, sourceId]
    );
  };
  
  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const cdssHealthStatus = cdssHealth?.status || 'unknown';
  const cdssHealthLabel = cdssHealthStatus === 'healthy'
    ? 'AI Health: OK'
    : cdssHealthStatus === 'degraded'
      ? 'AI Health: Degraded'
      : 'AI Health: Unknown';
  const cdssHealthClass = cdssHealthStatus === 'healthy'
    ? 'bg-emerald-100 text-emerald-700'
    : cdssHealthStatus === 'degraded'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';
  const cdssHealthLastChecked = cdssHealth?.lastCheck
    ? new Date(cdssHealth.lastCheck).toLocaleString()
    : null;
  
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600">
                <BrainCircuit className="h-6 w-6 text-white" />
              </div>
              Doctor Assist
              <Badge className="bg-purple-100 text-purple-700 text-xs">CDSS</Badge>
              <Badge className={cn("text-xs", cdssHealthClass)}>{cdssHealthLabel}</Badge>
              {cdssHealthLastChecked && (
                <span className="text-xs text-muted-foreground">Last checked: {cdssHealthLastChecked}</span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={refreshCDSSHealth}
                disabled={isHealthLoading}
                title="Refresh AI health"
              >
                {isHealthLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </h1>
            <p className="text-muted-foreground mt-1">
              Clinical Decision Support System • Evidence-based medical guidance
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Knowledge Base Upload */}
            <Dialog open={showKnowledgeUpload} onOpenChange={setShowKnowledgeUpload}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 hover:bg-amber-100">
                  <BookOpen className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-700">Knowledge Base</span>
                  {knowledgeStats.total_entries > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 text-xs ml-1">
                      {knowledgeStats.total_entries}
                    </Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-amber-600" />
                    CDSS Knowledge Base
                  </DialogTitle>
                  <DialogDescription>
                    Upload medical encyclopedias and reference PDFs to enhance CDSS responses
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <Card className="bg-amber-50">
                      <CardContent className="p-2 sm:p-3 text-center">
                        <p className="text-lg sm:text-2xl font-bold text-amber-700">{knowledgeStats.total_entries}</p>
                        <p className="text-[10px] sm:text-xs text-amber-600">Entries</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-orange-50">
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-orange-700">{knowledgeStats.unique_sources}</p>
                        <p className="text-xs text-orange-600">Sources</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-red-50">
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-red-700">
                          {knowledgeStats.sources?.includes('gale_encyclopedia') ? '✓' : '—'}
                        </p>
                        <p className="text-xs text-red-600">Gale</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Upload Area */}
                  <div className="border-2 border-dashed border-amber-300 rounded-lg p-6 text-center bg-amber-50/50">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePDFUpload(file);
                      }}
                    />
                    
                    {isUploading ? (
                      <div className="space-y-2">
                        <Loader2 className="h-8 w-8 mx-auto animate-spin text-amber-600" />
                        <p className="text-sm text-amber-700">Processing PDF...</p>
                        <p className="text-xs text-muted-foreground">Extracting text and generating embeddings</p>
                      </div>
                    ) : (
                      <>
                        <BookOpen className="h-10 w-10 mx-auto text-amber-400 mb-2" />
                        <p className="text-sm font-medium text-amber-700">Upload Gale Encyclopedia PDF</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Drop PDF here or click to browse
                        </p>
                        <Button 
                          className="mt-3 bg-amber-500 hover:bg-amber-600"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Select PDF
                        </Button>
                      </>
                    )}
                  </div>
                  
                  {/* Sources List */}
                  {knowledgeStats.sources && knowledgeStats.sources.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Ingested Sources</h4>
                      <div className="space-y-1">
                        {knowledgeStats.sources.filter(Boolean).map((source: string, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                            <span className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              {source.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            
            {/* Source Filter */}
            <Popover open={showSourceFilter} onOpenChange={setShowSourceFilter}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Library className="h-4 w-4" />
                  Sources ({selectedSources.length})
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Medical Sources</h4>
                  <p className="text-xs text-muted-foreground">Select journals and databases to search</p>
                  <Separator />
                  <div className="grid grid-cols-1 gap-1 max-h-60 overflow-y-auto">
                    {MEDICAL_SOURCES.map(source => (
                      <div
                        key={source.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800",
                          selectedSources.includes(source.id) && "bg-purple-50 dark:bg-purple-950/30"
                        )}
                        onClick={() => toggleSource(source.id)}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center",
                          selectedSources.includes(source.id) ? "bg-purple-500 border-purple-500" : "border-slate-300"
                        )}>
                          {selectedSources.includes(source.id) && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-base">{source.icon}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{source.name}</p>
                          <p className="text-[10px] text-muted-foreground">{source.region}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* History */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <History className="h-4 w-4 mr-2" />
                  History
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Query History</DialogTitle>
                  <DialogDescription>Your recent clinical queries</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  {queryHistory.length > 0 ? (
                    queryHistory.map(q => (
                      <Card key={q.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => {
                        setQuery(q.query);
                        setCurrentResponse(q.response || null);
                      }}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{q.query}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(q.timestamp).toLocaleString()} • {q.category}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              {q.isFavorite ? <Star className="h-4 w-4 text-amber-500" /> : <StarOff className="h-4 w-4" />}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No queries yet</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Query Input Section */}
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="space-y-4">
              {/* Specialty & Category Selection */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">Specialty</Label>
                  <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDICAL_SPECIALTIES.map(spec => {
                        const IconComponent = spec.icon;
                        return (
                          <SelectItem key={spec.id} value={spec.id}>
                            <div className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              {spec.name}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">Query Type</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUERY_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <cat.icon className="h-4 w-4" />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Main Query Input */}
              <div className="relative">
                <Textarea
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter your clinical query... (e.g., 'Management of resistant hypertension in diabetic patient with CKD')"
                  className="min-h-[100px] pr-24 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleSubmit();
                    }
                  }}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={isLoading || !query.trim()}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    {isLoading ? 'Analyzing...' : 'Search'}
                  </Button>
                </div>
              </div>
              
              {/* Quick Queries */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Quick Queries</Label>
                <div className="flex flex-wrap gap-2">
                  {quickQueries.map((q, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30"
                      onClick={() => setQuery(q)}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {currentResponse && (
          <div className="space-y-4">
            {/* Warnings */}
            {currentResponse.warnings.length > 0 && (
              <div className="space-y-2">
                {currentResponse.warnings.map((warning, i) => (
                  <ClinicalWarningCard key={i} warning={warning} />
                ))}
              </div>
            )}
            
            {/* Summary */}
            <Card className="bg-white dark:bg-slate-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Clinical Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{currentResponse.summary}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => copyToClipboard(currentResponse.summary)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </CardContent>
            </Card>
            
            {/* Tabbed Results */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 gap-1 h-auto lg:w-auto lg:inline-flex">
                <TabsTrigger value="guidelines" className="gap-1 px-2 py-1.5 sm:px-3 sm:py-2">
                  <BookOpen className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs">Guidelines</span>
                  <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">{currentResponse.clinicalGuidelines.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="drugs" className="gap-1 px-2 py-1.5 sm:px-3 sm:py-2">
                  <Pill className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs">Drugs</span>
                  <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">{currentResponse.drugInfo.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="differential" className="gap-1 px-2 py-1.5 sm:px-3 sm:py-2">
                  <ListChecks className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs">DDx</span>
                  <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">{currentResponse.differentialDiagnosis.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="labs" className="gap-1 px-2 py-1.5 sm:px-3 sm:py-2">
                  <FlaskConical className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs">Labs</span>
                  <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">{currentResponse.labTests.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="icd" className="gap-1 px-2 py-1.5 sm:px-3 sm:py-2">
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs">ICD-10</span>
                  <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">{currentResponse.icd10Codes.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="references" className="gap-1 px-2 py-1.5 sm:px-3 sm:py-2">
                  <Library className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs">Refs</span>
                  <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">{currentResponse.references.length}</Badge>
                </TabsTrigger>
              </TabsList>
              
              {/* Guidelines Tab */}
              <TabsContent value="guidelines" className="space-y-3">
                {currentResponse.clinicalGuidelines.length > 0 ? (
                  currentResponse.clinicalGuidelines.map((guideline, i) => (
                    <GuidelineCard key={i} guideline={guideline} />
                  ))
                ) : (
                  <Card className="bg-slate-50 dark:bg-slate-800/30">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No specific guidelines found for this query
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              {/* Drugs Tab */}
              <TabsContent value="drugs" className="space-y-3">
                {currentResponse.drugInfo.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {currentResponse.drugInfo.map((drug, i) => (
                      <DrugCard key={i} drug={drug} />
                    ))}
                  </div>
                ) : (
                  <Card className="bg-slate-50 dark:bg-slate-800/30">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <Pill className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No drug information for this query
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              {/* Differential Diagnosis Tab */}
              <TabsContent value="differential" className="space-y-3">
                {currentResponse.differentialDiagnosis.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {currentResponse.differentialDiagnosis.map((diff, i) => (
                      <DifferentialCard key={i} differential={diff} />
                    ))}
                  </div>
                ) : (
                  <Card className="bg-slate-50 dark:bg-slate-800/30">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <ListChecks className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No differential diagnoses for this query
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              {/* Labs Tab */}
              <TabsContent value="labs">
                {currentResponse.labTests.length > 0 ? (
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y dark:divide-slate-700">
                        {currentResponse.labTests.map((lab, i) => (
                          <div key={i} className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-semibold text-sm">{lab.name}</h4>
                                <p className="text-xs text-muted-foreground">{lab.purpose}</p>
                              </div>
                              <Badge variant="outline">{lab.normalRange}</Badge>
                            </div>
                            <p className="text-xs mt-2 text-slate-600 dark:text-slate-400">
                              <span className="font-medium">Interpretation:</span> {lab.interpretation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-slate-50 dark:bg-slate-800/30">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <FlaskConical className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No lab recommendations for this query
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              {/* ICD-10 Tab */}
              <TabsContent value="icd">
                {currentResponse.icd10Codes.length > 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {currentResponse.icd10Codes.map((code, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                            onClick={() => copyToClipboard(code.code)}
                          >
                            <Badge className="bg-blue-500 text-white font-mono">{code.code}</Badge>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{code.description}</p>
                              <p className="text-xs text-muted-foreground">{code.category}</p>
                            </div>
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-slate-50 dark:bg-slate-800/30">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      No ICD-10 codes for this query
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              {/* References Tab */}
              <TabsContent value="references">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    {currentResponse.references.map((ref, i) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-sm">{ref.title}</h4>
                            <p className="text-xs text-muted-foreground">
                              {ref.authors} • {ref.journal} • {ref.year}
                            </p>
                          </div>
                          {ref.url && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={ref.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                        {ref.abstract && (
                          <p className="text-xs text-muted-foreground mt-2">{ref.abstract}</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
        
        {/* Empty State */}
        {!currentResponse && !isLoading && (
          <Card className="bg-slate-50 dark:bg-slate-800/30 border-dashed">
            <CardContent className="p-12 text-center">
              <BrainCircuit className="h-16 w-16 mx-auto mb-4 text-purple-300" />
              <h3 className="text-lg font-semibold mb-2">Clinical Decision Support</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                Enter a clinical query above to get evidence-based guidance from major medical journals including BMJ, NEJM, Lancet, JAMA, and Indian medical journals.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {MEDICAL_SOURCES.slice(0, 6).map(source => (
                  <Badge key={source.id} variant="outline" className="text-xs">
                    {source.icon} {source.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Loading State */}
        {isLoading && (
          <Card className="bg-purple-50 dark:bg-purple-950/30">
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 text-purple-500 animate-spin" />
              <h3 className="text-lg font-semibold mb-2">Analyzing Clinical Data</h3>
              <p className="text-muted-foreground">
                Searching medical databases and generating evidence-based recommendations...
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Badge className="animate-pulse">Searching BMJ...</Badge>
                <Badge className="animate-pulse">Querying NEJM...</Badge>
                <Badge className="animate-pulse">Checking IJMR...</Badge>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Disclaimer */}
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Clinical Disclaimer</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Doctor Assist provides decision support based on published guidelines and evidence. 
                  Always apply clinical judgment and consider individual patient factors. 
                  This tool does not replace professional medical decision-making.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default DoctorAssist;
