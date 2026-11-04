/**
 * Doctor Copilot API client — JavaScript (React Native msh_d_app)
 * AI-PLATFORM-001
 */

function normalizeHistory(history = []) {
  return history.slice(-15).map((turn) => ({
    role: turn.role,
    text: String(turn.text || turn.content || turn.message || ''),
  }));
}

function pickResponseText(data) {
  return (
    data?.response ||
    data?.speak ||
    data?.primary_response ||
    (typeof data?.error === 'string' ? data.error : '') ||
    ''
  ).trim();
}

export function createDoctorCopilotClient(config) {
  const base = String(config.baseUrl || '').replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 30000;

  async function authHeaders() {
    const token = await config.getToken();
    if (!token) throw new Error('Doctor auth token missing');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  async function request(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(await authHeaders()),
          ...(init.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body?.error || body?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async chat(payload) {
      const message = String(payload?.message || payload?.text || '').trim();
      if (!message) throw new Error('message is required');

      const data = await request('/doctor-copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          history: normalizeHistory(payload?.history),
          context: payload?.context || {},
          sessionId: payload?.sessionId,
          language: payload?.language || 'en',
          mode: payload?.mode || 'auto',
        }),
      });

      return {
        ...data,
        response: pickResponseText(data) || data?.response,
      };
    },

    async proposeAppointmentChange(change) {
      return request('/medical-ai/actions/propose',{method:'POST',body:JSON.stringify(change)});
    },
    async confirmAppointmentChange({actionId,confirmationToken,confirmed}) {
      if(confirmed!==true) throw new Error('Explicit appointment confirmation required');
      return request('/medical-ai/actions/confirm',{method:'POST',body:JSON.stringify({actionId,confirmationToken,confirmed:true})});
    },
    async getHandoff(appointmentId) {return request(`/medical-ai/handoffs/${encodeURIComponent(appointmentId)}`);},
    async decideHandoff(appointmentId,status) {return request(`/medical-ai/handoffs/${encodeURIComponent(appointmentId)}/decision`,{method:'POST',body:JSON.stringify({status})});},

    async getBriefing() {
      return request('/voice-assistant/briefing', { method: 'GET' });
    },

    async speechToText(formData) {
      const token = await config.getToken();
      if (!token) throw new Error('Doctor auth token missing');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${base}/voice-assistant/stt`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
          signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `STT HTTP ${res.status}`);
        return body;
      } finally {
        clearTimeout(timer);
      }
    },

    async health() {
      return request('/doctor-copilot/health', { method: 'GET' });
    },
  };
}

export default createDoctorCopilotClient;
