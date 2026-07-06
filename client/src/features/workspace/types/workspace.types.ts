export type ClinicalSeverity = 'critical' | 'warning' | 'info' | 'high' | 'moderate';

export interface CoordinatorAlert {
  id: number | string;
  message: string;
  severity?: ClinicalSeverity;
  confidence_score?: number;
  data_completeness?: number;
  samd_class?: string;
  agent?: string;
  created_at?: string;
  status?: 'pending' | 'approved' | 'dismissed' | 'modified';
}

export interface CareTeamMember {
  id: number | string;
  display_name?: string;
  role?: string;
  invited_by?: string;
}

export interface CareTask {
  id: number;
  title: string;
  status: string;
  priority?: string;
  owner_role?: string;
}

export interface PathwayStep {
  id?: number | string;
  label: string;
  status?: string;
}

export interface TreatmentPathway {
  current_goal?: string;
  current_progress?: number;
  steps?: PathwayStep[];
}

export interface TimelineEvent {
  id: number | string;
  event_at: string;
  event_type: string;
  title: string;
  body?: string;
  severity?: ClinicalSeverity;
  actor_name?: string;
}

export interface LivingWorkspace {
  patientId?: number;
  organizationId?: number;
  patient?: {
    first_name?: string;
    last_name?: string;
    mrn?: string;
    uhid?: string;
  };
  admission?: Record<string, unknown>;
  diagnosis?: string;
  careTeam?: { members?: CareTeamMember[] };
  pathway?: TreatmentPathway;
  sections?: {
    timeline?: { count?: number; events?: TimelineEvent[] };
    liveVitals?: Array<{ label?: string; type?: string; value?: string; unit?: string }>;
    tasks?: CareTask[];
    ai?: {
      coordinatorAlerts?: CoordinatorAlert[];
      similarCases?: { prompt?: string; cases?: unknown[] };
    };
    labs?: unknown[];
    pharmacy?: unknown[];
    monitoring?: { summary?: Array<{ metricType: string; latest?: { value: number }; avg?: number }> };
    familyUpdates?: unknown[];
  };
  medicalPassport?: { careos_patient_id?: string; summary_text?: string };
}

export interface AIAgentRosterEntry {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'idle' | 'alert';
  lastActivity?: string;
  alertCount?: number;
}

export const AI_AGENT_ROSTER: AIAgentRosterEntry[] = [
  { id: 'clinical', name: 'Clinical Intelligence', description: 'Admission briefings, chart synthesis', status: 'idle' },
  { id: 'monitoring', name: 'Monitoring Agent', description: 'Vitals, devices, deterioration patterns', status: 'idle' },
  { id: 'medication', name: 'Medication Agent', description: 'Interactions, dosing, formulary', status: 'idle' },
  { id: 'documentation', name: 'Documentation Agent', description: 'Ambient notes and summaries', status: 'idle' },
  { id: 'research', name: 'Research Agent', description: 'Guidelines, similar cases, trials', status: 'idle' },
  { id: 'workflow', name: 'Workflow Agent', description: 'Scheduling and resource optimization', status: 'idle' },
  { id: 'prediction', name: 'Prediction Agent', description: 'LOS, readmission, bed forecast', status: 'idle' },
  { id: 'family', name: 'Family Agent', description: 'Plain-language family updates', status: 'idle' },
];
