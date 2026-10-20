import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const terminal = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);
export const fail = (status, code, message) => Object.assign(new Error(message), { statusCode: status, code });
export function tenant(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(value)) throw fail(403, 'TENANT_REQUIRED', 'An unambiguous tenant UID is required');
  return value;
}
export function phone(value) {
  if (typeof value !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value)) throw fail(400, 'INVALID_PHONE', 'Use an E.164 phone number');
  return value;
}
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function stateAfter(current, incoming) {
  const normalized = { 'in-progress': 'answered', 'noanswer': 'no-answer', 'cancelled': 'canceled' }[incoming] || incoming;
  const rank = { submitting: 0, unknown: 0, queued: 1, ringing: 2, answered: 3 };
  if (!terminal.has(normalized) && rank[normalized] === undefined) throw fail(400, 'INVALID_EVENT', 'Unknown call state');
  if (terminal.has(current)) return current;
  return terminal.has(normalized) || rank[normalized] >= (rank[current] ?? 0) ? normalized : current;
}
export function selectAgent(agents, queue, now = Date.now()) {
  const eligible = agents.filter(a => a.presence === 'available' && !a.active_call_id && (!a.wrap_until || Date.parse(a.wrap_until) <= now)
    && (queue.skills || []).every(s => a.skills.includes(s)) && (queue.languages || []).every(s => a.languages.includes(s)));
  return eligible.sort((a, b) => (Number(b.priority) - Number(a.priority)) || (Date.parse(a.last_call_end || 0) - Date.parse(b.last_call_end || 0)) || String(a.user_id).localeCompare(String(b.user_id)))[0] || null;
}

export function validateFlow(graph) {
  if (JSON.stringify(graph || {}).length > 65536) throw fail(400, 'INVALID_FLOW', 'Flow exceeds the size limit');
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length < 1 || graph.nodes.length > 100) throw fail(400, 'INVALID_FLOW', 'Flow needs 1–100 nodes');
  const nodes = new Map();
  for (const n of graph.nodes) {
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(n.id || '') || nodes.has(n.id) || !['greeting', 'menu', 'queue', 'hours', 'end'].includes(n.type)) throw fail(400, 'INVALID_FLOW', 'Invalid or duplicate flow node');
    if (n.type === 'menu' && (!n.options || Object.keys(n.options).some(k => !/^[0-9#*]$/.test(k)))) throw fail(400, 'INVALID_FLOW', 'Menu options must be DTMF digits');
    if (n.type === 'queue' && !/^[0-9a-f-]{36}$/i.test(n.queueId || '')) throw fail(400, 'INVALID_FLOW', 'Queue node requires a queue ID');
    if (n.type === 'hours') {
      try { new Intl.DateTimeFormat('en', { timeZone: n.timezone }); } catch { throw fail(400, 'INVALID_FLOW', 'Invalid timezone'); }
      if (!n.timezone || !Array.isArray(n.days) || n.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(n.open || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(n.close || '') || n.open >= n.close) throw fail(400, 'INVALID_FLOW', 'Invalid opening hours');
      if (n.holidays && (!Array.isArray(n.holidays) || n.holidays.length>365 || n.holidays.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)))) throw fail(400,'INVALID_FLOW','Invalid holidays');
    }
    nodes.set(n.id, n);
  }
  if (!nodes.has(graph.start)) throw fail(400, 'INVALID_FLOW', 'Missing start node');
  const visited = new Set(), active = new Set();
  function visit(id) {
    if (!nodes.has(id)) throw fail(400, 'INVALID_FLOW', 'Dangling node reference');
    if (active.has(id)) throw fail(400, 'INVALID_FLOW', 'Unbounded routing cycles are not allowed');
    if (visited.has(id)) return;
    active.add(id);
    const n = nodes.get(id);
    const refs = n.type === 'menu' ? [...Object.values(n.options), n.timeout] : n.type === 'hours' ? [n.inside, n.outside] : n.type === 'greeting' ? [n.next] : [];
    if (refs.some(v => typeof v !== 'string')) throw fail(400, 'INVALID_FLOW', 'Missing fallback or next node');
    refs.forEach(visit); active.delete(id); visited.add(id);
  }
  visit(graph.start);
  if (visited.size !== nodes.size) throw fail(400, 'INVALID_FLOW', 'Unreachable nodes are not allowed');
  return graph;
}

export function routeFlow(graph, { nodeId = graph.start, digit, now = new Date() } = {}) {
  validateFlow(graph);
  let node = graph.nodes.find(n => n.id === nodeId);
  if (!node) throw fail(400, 'INVALID_FLOW_NODE', 'Flow node does not exist');
  if (node.type === 'menu' && digit !== undefined) return { next: node.options[digit] || node.timeout };
  if (node.type === 'hours') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: node.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: node.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const time = `${parts.hour}:${parts.minute}`;
    return { next: node.days.includes(day) && !(node.holidays || []).includes(date) && time >= node.open && time < node.close ? node.inside : node.outside };
  }
  return node;
}

export function verifyGateway({ secret, timestamp, nonce, body, signature, now = Date.now() }) {
  if (!secret || !/^\d{13}$/.test(timestamp || '') || Math.abs(now - Number(timestamp)) > 120000 || !/^[a-zA-Z0-9_-]{16,80}$/.test(nonce || '')) throw fail(403, 'INVALID_SIGNATURE', 'Invalid service event');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${JSON.stringify(body)}`).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(signature || '') || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw fail(403, 'INVALID_SIGNATURE', 'Invalid service event');
}
