import { Bot, BarChart3, DollarSign, ShieldCheck } from 'lucide-react';

export type Persona = 'ops' | 'analytics' | 'revenue' | 'quality';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotResponse {
  success: boolean;
  response: string;
  agentsUsed: string[];
  taskPlan: any;
  totalTokens: number;
  latencyMs: number;
  requiresApproval?: boolean;
  pendingAction?: any;
  conversationId?: number;
}

export interface PersonaConfig {
  label: string;
  icon: typeof Bot;
  forceAgent: string;
  description: string;
  quickPrompts: string[];
}

export const PERSONA_CONFIG: Record<Persona, PersonaConfig> = {
  ops: {
    label: 'Operations',
    icon: Bot,
    forceAgent: 'admin',
    description: 'System health, agent status, audit logs, governance queue',
    quickPrompts: [
      'Show system status',
      'List all registered agents',
      'Show recent audit log entries',
      'Get governance queue',
    ],
  },
  analytics: {
    label: 'Analytics',
    icon: BarChart3,
    forceAgent: 'analyst',
    description: 'Tenant stats, LLM performance, error trends, revenue summary',
    quickPrompts: [
      'Show tenant stats',
      'Which agents had the most errors today?',
      'Show LLM provider performance',
      'Revenue summary for this month',
    ],
  },
  revenue: {
    label: 'Revenue & TPA',
    icon: DollarSign,
    forceAgent: 'insurance',
    description: 'Pre-auth requests, insurance claims, billing anomalies',
    quickPrompts: [
      'Show pending pre-auth requests',
      'Insurance claims summary',
      'Billing anomalies this week',
    ],
  },
  quality: {
    label: 'Quality & Safety',
    icon: ShieldCheck,
    forceAgent: 'clinical',
    description: 'Quality gates, SaMD governance, triage escalations, demographic parity',
    quickPrompts: [
      'Show quality gate failures today',
      'Recent SaMD governance changes',
      'Triage escalation patterns',
      'Demographic parity status',
    ],
  },
};

export async function sendCopilotMessage(params: {
  message: string;
  persona: Persona;
  conversationId: number | null;
  contextMessages: ConversationMessage[];
}): Promise<CopilotResponse> {
  const { message, persona, conversationId, contextMessages } = params;
  const adminToken = localStorage.getItem('adminToken');

  const body: Record<string, any> = {
    message,
    forceAgent: PERSONA_CONFIG[persona].forceAgent,
    conversationHistory: contextMessages,
  };
  if (conversationId !== null) {
    body.conversationId = conversationId;
  }

  const res = await fetch('/api/v3/ai-brain/agents/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data as CopilotResponse;
}
