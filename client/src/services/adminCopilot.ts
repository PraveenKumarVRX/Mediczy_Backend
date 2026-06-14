/**
 * Admin Copilot API client — /api/v3/ai-brain/agents/*
 */

import api from '@/utils/api';

export type CopilotPersona = 'ops' | 'analytics' | 'revenue' | 'quality' | 'clinical';

export const PERSONA_AGENTS: Record<CopilotPersona, string> = {
  ops: 'admin',
  analytics: 'analyst',
  revenue: 'insurance',
  quality: 'analyst',
  clinical: 'clinical',
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentProcessResponse {
  success: boolean;
  response: string;
  agentsUsed: Array<{ id: string; tokens?: number; tools?: string[]; latencyMs?: number }>;
  taskPlan?: Record<string, unknown>;
  identity?: { role: string; source?: string };
  meta?: { totalTokens?: number; latencyMs?: number; isMultiAgent?: boolean };
  error?: string;
  code?: string;
}

export interface PendingAction {
  action_id: string;
  tool_name: string;
  summary: string;
  created_at: string;
}

function getAdminToken(): string {
  return localStorage.getItem('adminToken') || '';
}

function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function processMessage(
  message: string,
  options: {
    conversationId?: number;
    contextMessages?: ChatMessage[];
    persona?: CopilotPersona;
    stream?: boolean;
    onEvent?: (event: Record<string, unknown>) => void;
  } = {}
): Promise<AgentProcessResponse> {
  const persona = options.persona || 'ops';
  const forceAgent = PERSONA_AGENTS[persona];
  const body = {
    message,
    conversationId: options.conversationId,
    contextMessages: options.contextMessages,
    forceAgent,
    copilotType: persona,
  };

  if (options.stream && options.onEvent) {
    const base = api.defaults.baseURL || '/api';
    const res = await fetch(`${base}/v3/ai-brain/agents/process/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let final: AgentProcessResponse = { success: true, response: '', agentsUsed: [] };

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            options.onEvent(event);
            if (event.type === 'response') {
              final = {
                success: true,
                response: event.response,
                agentsUsed: event.agentsUsed || [],
                taskPlan: event.taskPlan,
                meta: event.meta,
              };
            }
          } catch { /* skip malformed */ }
        }
      }
    }
    return final;
  }

  const { data } = await api.post<AgentProcessResponse>(
    '/v3/ai-brain/agents/process',
    body,
    { headers: authHeaders() }
  );
  return data;
}

export async function getAvailableAgents() {
  const { data } = await api.get('/v3/ai-brain/agents/available', { headers: authHeaders() });
  return data;
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const { data } = await api.get('/v3/ai-brain/agents/pending-actions', { headers: authHeaders() });
  return data.actions || [];
}

export async function approveAction(actionId: string, approve: boolean) {
  const { data } = await api.post(
    '/v3/ai-brain/agents/approve-action',
    { actionId, approve },
    { headers: authHeaders() }
  );
  return data;
}

export const QUICK_PROMPTS = [
  'What agents can I invoke?',
  'Show recent AI agent run history',
  'What is the current system status?',
  'Summarize pending AI governance changes',
  'List all registered agents and their tool counts',
];

export const DEEP_LINKS = [
  { label: 'AI Governance', path: '/admin/ai-governance' },
  { label: 'AI Guard', path: '/admin/ai-guard' },
  { label: 'AI Analytics', path: '/admin/ai-analytics' },
  { label: 'Prompt Manager', path: '/admin/feedback-intelligence/prompts' },
];
