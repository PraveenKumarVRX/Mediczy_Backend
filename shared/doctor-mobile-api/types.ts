/**
 * Doctor Copilot API types — shared between web and React Native (msh_d_app).
 * MED-AI-LAYER-001 / AI-PLATFORM-001
 */

export type CopilotHistoryRole = 'user' | 'assistant' | 'doctor';

export interface CopilotHistoryTurn {
  role: CopilotHistoryRole;
  text?: string;
  content?: string;
  message?: string;
}

export interface CopilotPatientContext {
  id?: number | string;
  name?: string;
  age?: number;
  gender?: string;
}

export interface DoctorCopilotContext {
  currentScreen?: string;
  screen?: string;
  currentPatient?: CopilotPatientContext | null;
  patient?: CopilotPatientContext | null;
  doctorName?: string;
}

export type DoctorCopilotMode = 'auto' | 'agent' | 'clinical';

export interface DoctorCopilotChatRequest {
  /** Primary message field (preferred) */
  message: string;
  /** Legacy alias — still accepted by gateway */
  text?: string;
  history?: CopilotHistoryTurn[];
  context?: DoctorCopilotContext;
  sessionId?: string;
  language?: string;
  mode?: DoctorCopilotMode;
}

export interface DoctorCopilotChatResponse {
  success?: boolean;
  intent?: string;
  action?: string | null;
  parameters?: Record<string, unknown> | null;
  response?: string;
  speak?: string;
  primary_response?: string;
  data?: unknown;
  requiresConfirmation?: boolean;
  traceId?: string;
  gateway?: 'doctor-copilot';
  platformInitiative?: 'AI-PLATFORM-001';
  path?: 'agent' | 'clinical';
  error?: string;
}

export interface DoctorCopilotClientConfig {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  timeoutMs?: number;
}

export interface DoctorCopilotSttResponse {
  text: string;
  language?: string;
  provider?: string;
}

export interface DoctorCopilotBriefingResponse {
  summary?: string;
  todayAppointments?: number;
  pending?: number;
  completed?: number;
  [key: string]: unknown;
}
