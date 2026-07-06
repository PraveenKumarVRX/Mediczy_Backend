import api from '@/utils/api';

export type CopilotPersona = 'ops' | 'analytics' | 'revenue' | 'quality' | 'clinical';
export type ForceAgent = 'admin' | 'analyst' | 'insurance' | 'clinical';

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentProcessRequest {
  message: string;
  conversationId?: number;
  contextMessages?: CopilotMessage[];
  forceAgent?: ForceAgent;
  copilotType?: string;
  persona?: CopilotPersona;
}

export interface AgentProcessResponse {
  success: boolean;
  response: string;
  agentsUsed: Array<{ id: string; tokens?: number; tools?: string[]; latencyMs?: number }>;
  taskPlan?: Record<string, unknown>;
  identity?: { role?: string; source?: string };
  meta?: { totalTokens?: number; latencyMs?: number; isMultiAgent?: boolean };
  error?: string;
  code?: string;
}

export interface CopilotConfig {
  enabled: boolean;
  streaming: boolean;
  writeActions: boolean;
}

export interface PendingApproval {
  actionId: string;
  summary: string;
  toolName?: string;
}

const PERSONA_AGENT: Record<CopilotPersona, ForceAgent> = {
  ops: 'admin',
  analytics: 'analyst',
  revenue: 'insurance',
  quality: 'analyst',
  clinical: 'clinical',
};

export function personaToForceAgent(persona: CopilotPersona): ForceAgent {
  return PERSONA_AGENT[persona] || 'admin';
}

export async function getCopilotConfig(): Promise<CopilotConfig> {
  const { data } = await api.get('/v3/ai-brain/agents/copilot-config');
  return {
    enabled: data.enabled !== false,
    streaming: data.streaming !== false,
    writeActions: data.writeActions === true,
  };
}

export async function getAvailableAgents() {
  const { data } = await api.get('/v3/ai-brain/agents/available');
  return data.agents || [];
}

export async function getAgentHistory(limit = 10) {
  const { data } = await api.get('/v3/ai-brain/agents/history', { params: { limit } });
  return data.history || [];
}

export async function processMessage(req: AgentProcessRequest): Promise<AgentProcessResponse> {
  const { data } = await api.post('/v3/ai-brain/agents/process', req);
  return data;
}

export async function approveAction(actionId: string, reject = false) {
  const { data } = await api.post('/v3/ai-brain/agents/approve-action', { actionId, reject });
  return data;
}

export type StreamEvent =
  | { type: 'status'; message?: string }
  | { type: 'agent_switch'; agents?: string[] }
  | { type: 'tool_start'; tool?: string }
  | { type: 'tool_end'; tool?: string; pendingApproval?: boolean }
  | { type: 'token'; content?: string }
  | { type: 'response' } & AgentProcessResponse
  | { type: 'done' }
  | { type: 'error'; error?: string; code?: string };

export async function processMessageStream(
  req: AgentProcessRequest,
  onEvent: (event: StreamEvent) => void
): Promise<AgentProcessResponse | null> {
  const baseURL = api.defaults.baseURL || '/api';
  const token =
    localStorage.getItem('adminToken') ||
    localStorage.getItem('teamToken') ||
    localStorage.getItem('token');

  const res = await fetch(`${baseURL}/v3/ai-brain/agents/process/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResponse: AgentProcessResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return finalResponse;
      try {
        const event = JSON.parse(payload) as StreamEvent;
        onEvent(event);
        if (event.type === 'response') {
          finalResponse = event as AgentProcessResponse;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return finalResponse;
}

export function extractPendingApproval(text: string): PendingApproval | null {
  try {
    const match = text.match(/"actionId"\s*:\s*"([a-f0-9-]{36})"/i);
    if (!match) return null;
    const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/);
    return {
      actionId: match[1],
      summary: summaryMatch?.[1] || 'Pending write action',
    };
  } catch {
    return null;
  }
}
