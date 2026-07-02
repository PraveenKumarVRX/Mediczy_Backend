import api from '@/lib/api';
import type { ModuleCopilotId } from '@/config/moduleCopilot.registry';

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendModuleCopilotMessage(params: {
  moduleId: ModuleCopilotId;
  message: string;
  context?: Record<string, unknown>;
  conversationHistory?: CopilotMessage[];
}) {
  const res = await api.post('/v3/module-copilot/chat', {
    moduleId: params.moduleId,
    message: params.message,
    context: params.context || {},
    conversationHistory: params.conversationHistory || [],
  });
  return res.data as {
    success: boolean;
    response: string;
    copilotLabel: string;
    samd?: boolean;
    agentsUsed?: string[];
    meta?: { latencyMs?: number };
  };
}

export async function listModuleCopilots() {
  const res = await api.get('/v3/module-copilot/modules');
  return res.data;
}
