import pool from '../db/pgPool.js';
import { sendReply } from './social-inbox.service.js';

const NODE_TYPES = new Set(['trigger','condition','delay','split','randomizer','send_message','http_request','set_field','wait_for_reply','hand_to_human']);
const MAX_NODES = 100;
const MAX_STEPS_PER_TICK = 25;

function actorId(user) { const n = Number.parseInt(user?.id, 10); return Number.isInteger(n) ? n : null; }
function parseJson(value, fallback = {}) { if (value == null) return fallback; return typeof value === 'object' ? value : JSON.parse(value); }
function validateGraph(nodes = [], edges = []) {
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > MAX_NODES) throw Object.assign(new Error(`nodes must contain 1-${MAX_NODES} items`), { statusCode: 400 });
  const keys = new Set();
  for (const node of nodes) {
    const key = String(node.nodeKey || '').trim(); const type = String(node.nodeType || '').trim();
    if (!key || key.length > 100 || keys.has(key) || !NODE_TYPES.has(type)) throw Object.assign(new Error('Each node needs a unique nodeKey and supported nodeType'), { statusCode: 400 });
    keys.add(key);
  }
  if (!Array.isArray(edges) || edges.length > MAX_NODES * 2 || edges.some((e) => !keys.has(String(e.fromNodeKey)) || !keys.has(String(e.toNodeKey)))) throw Object.assign(new Error('Edges must reference existing nodes'), { statusCode: 400 });
  return { nodes, edges };
}

export async function listFlows(tenantUid, { status } = {}) {
  const result = await pool.query(`SELECT f.*, COUNT(n.id)::int AS node_count FROM crm_flow_definitions f LEFT JOIN crm_flow_nodes n ON n.flow_id=f.id WHERE f.tenant_uid=$1 AND ($2::text IS NULL OR f.status=$2) GROUP BY f.id ORDER BY f.updated_at DESC`, [tenantUid, status || null]);
  return result.rows;
}

export async function getFlow(tenantUid, id) {
  const flow = await pool.query('SELECT * FROM crm_flow_definitions WHERE tenant_uid=$1 AND id=$2', [tenantUid, id]);
  if (!flow.rows[0]) return null;
  const [nodes, edges] = await Promise.all([
    pool.query('SELECT node_key,node_type,config,position FROM crm_flow_nodes WHERE flow_id=$1 ORDER BY id', [id]),
    pool.query('SELECT from_node_key,to_node_key,branch_key FROM crm_flow_edges WHERE flow_id=$1 ORDER BY id', [id]),
  ]);
  return { ...flow.rows[0], trigger_config: parseJson(flow.rows[0].trigger_config), nodes: nodes.rows.map((n) => ({ ...n, config: parseJson(n.config), position: parseJson(n.position) })), edges: edges.rows };
}

export async function createFlow(tenantUid, input, user) {
  const name = String(input.name || '').trim(); if (!name || name.length > 160) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  const graph = validateGraph(input.nodes, input.edges || []); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const versionResult = await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM crm_flow_definitions WHERE tenant_uid=$1 AND name=$2', [tenantUid, name]);
    const f = await client.query(`INSERT INTO crm_flow_definitions (tenant_uid,name,description,version,trigger_config,created_by,updated_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6) RETURNING id`, [tenantUid, name, input.description || null, versionResult.rows[0].version, JSON.stringify(input.trigger || {}), actorId(user)]);
    for (const node of graph.nodes) await client.query('INSERT INTO crm_flow_nodes (flow_id,node_key,node_type,config,position) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)', [f.rows[0].id, node.nodeKey, node.nodeType, JSON.stringify(node.config || {}), JSON.stringify(node.position || {})]);
    for (const edge of graph.edges) await client.query('INSERT INTO crm_flow_edges (flow_id,from_node_key,to_node_key,branch_key) VALUES ($1,$2,$3,$4)', [f.rows[0].id, edge.fromNodeKey, edge.toNodeKey, edge.branchKey || 'default']);
    await client.query('COMMIT'); return getFlow(tenantUid, f.rows[0].id);
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

/** Save a new immutable draft version. Published versions are never mutated,
 * so in-flight runs retain the graph they were created from. */
export async function updateFlow(tenantUid, id, input, user) {
  const current = await getFlow(tenantUid, id);
  if (!current) return null;
  const name = String(input.name || current.name).trim();
  const graph = validateGraph(input.nodes || current.nodes.map((node) => ({ nodeKey: node.node_key, nodeType: node.node_type, config: node.config, position: node.position })), input.edges || current.edges.map((edge) => ({ fromNodeKey: edge.from_node_key, toNodeKey: edge.to_node_key, branchKey: edge.branch_key })));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const versionResult = await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM crm_flow_definitions WHERE tenant_uid=$1 AND name=$2', [tenantUid, name]);
    const f = await client.query(`INSERT INTO crm_flow_definitions (tenant_uid,name,description,status,version,trigger_config,created_by,updated_by) VALUES ($1,$2,$3,'draft',$4,$5::jsonb,$6,$6) RETURNING id`, [tenantUid, name, input.description ?? current.description ?? null, versionResult.rows[0].version, JSON.stringify(input.trigger ?? current.trigger_config ?? {}), actorId(user)]);
    for (const node of graph.nodes) await client.query('INSERT INTO crm_flow_nodes (flow_id,node_key,node_type,config,position) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)', [f.rows[0].id, node.nodeKey, node.nodeType, JSON.stringify(node.config || {}), JSON.stringify(node.position || {})]);
    for (const edge of graph.edges) await client.query('INSERT INTO crm_flow_edges (flow_id,from_node_key,to_node_key,branch_key) VALUES ($1,$2,$3,$4)', [f.rows[0].id, edge.fromNodeKey, edge.toNodeKey, edge.branchKey || 'default']);
    await client.query('COMMIT');
    return getFlow(tenantUid, f.rows[0].id);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function publishFlow(tenantUid, id, user) {
  const flow = await getFlow(tenantUid, id); if (!flow) return null;
  validateGraph(flow.nodes.map((n) => ({ nodeKey: n.node_key, nodeType: n.node_type })), flow.edges.map((e) => ({ fromNodeKey: e.from_node_key, toNodeKey: e.to_node_key })));
  await pool.query(`UPDATE crm_flow_definitions SET status='published',published_at=NOW(),updated_by=$3,updated_at=NOW() WHERE tenant_uid=$1 AND id=$2`, [tenantUid, id, actorId(user)]);
  return getFlow(tenantUid, id);
}

export async function runFlow(tenantUid, id, input = {}, { dryRun = true, user } = {}) {
  const flow = await getFlow(tenantUid, id); if (!flow) return null;
  if (flow.status !== 'published' && !dryRun) throw Object.assign(new Error('Only published flows may run'), { statusCode: 409 });
  const byKey = new Map(flow.nodes.map((n) => [n.node_key, n])); const next = new Map();
  for (const edge of flow.edges) { if (!next.has(edge.from_node_key)) next.set(edge.from_node_key, []); next.get(edge.from_node_key).push(edge); }
  const start = flow.nodes.find((n) => n.node_type === 'trigger') || flow.nodes[0]; const visited = []; const queue = [start.node_key];
  while (queue.length && visited.length < MAX_NODES) { const key = queue.shift(); if (visited.includes(key)) continue; const node = byKey.get(key); if (!node) continue; visited.push({ nodeKey: key, nodeType: node.node_type, config: node.config }); for (const edge of (next.get(key) || [])) queue.push(edge.to_node_key); }
  if (dryRun) return { dryRun: true, flowId: id, nodesVisited: visited, input };
  const run = await pool.query(`INSERT INTO crm_flow_runs (flow_id,tenant_uid,lead_id,status,current_node_key,state,next_run_at,started_at) VALUES ($1,$2,$3,'queued',$4,$5::jsonb,NOW(),NOW()) RETURNING *`, [id, tenantUid, input.leadId || null, start.node_key, JSON.stringify({ input, visited })]);
  await pool.query('INSERT INTO crm_flow_run_events (run_id,node_key,event_type,payload) VALUES ($1,$2,$3,$4::jsonb)', [run.rows[0].id, start.node_key, 'queued', JSON.stringify({ actorUserId: actorId(user) })]);
  return run.rows[0];
}

function readPath(value, path) {
  return String(path || '').split('.').filter(Boolean).reduce((current, key) => current == null ? undefined : current[key], value);
}

function writePath(target, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (!keys.length) return;
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

function matchesCondition(actual, config = {}) {
  const op = String(config.operator || config.op || 'equals');
  const expected = config.value;
  if (op === 'exists') return actual !== undefined && actual !== null;
  if (op === 'not_exists') return actual === undefined || actual === null;
  if (op === 'contains') return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? '').includes(String(expected));
  if (op === 'in') return Array.isArray(expected) && expected.includes(actual);
  if (op === 'greater_than') return Number(actual) > Number(expected);
  if (op === 'less_than') return Number(actual) < Number(expected);
  return actual === expected || String(actual ?? '') === String(expected ?? '');
}

function selectEdges(edges, node, state) {
  if (!edges.length) return [];
  if (node.node_type === 'condition') {
    const result = matchesCondition(readPath(state, node.config?.path), node.config || {});
    const branch = result ? (node.config?.trueBranch || 'true') : (node.config?.falseBranch || 'false');
    const branched = edges.filter((edge) => edge.branch_key === branch);
    return branched.length ? branched : edges.filter((edge) => edge.branch_key === 'default');
  }
  if (node.node_type === 'split') {
    const branch = String(node.config?.branch || readPath(state, node.config?.branchPath) || 'default');
    const branched = edges.filter((edge) => edge.branch_key === branch);
    return branched.length ? branched : edges.filter((edge) => edge.branch_key === 'default');
  }
  if (node.node_type === 'randomizer') {
    const weighted = edges.map((edge) => ({ edge, weight: Math.max(0, Number(node.config?.weights?.[edge.branch_key] ?? 1)) }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let cursor = Math.random() * (total || weighted.length);
    for (const item of weighted) { cursor -= item.weight || 1; if (cursor <= 0) return [item.edge]; }
  }
  return edges.filter((edge) => edge.branch_key === 'default' || edges.length === 1);
}

async function claimFlowRun(tenantUid, runId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT r.*, f.name AS flow_name FROM crm_flow_runs r JOIN crm_flow_definitions f ON f.id=r.flow_id WHERE r.id=$1 AND r.tenant_uid=$2 AND r.status IN ('queued','waiting') AND (r.next_run_at IS NULL OR r.next_run_at <= NOW()) FOR UPDATE SKIP LOCKED`, [runId, tenantUid]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return null; }
    const { rows } = await client.query(`UPDATE crm_flow_runs SET status='running', started_at=COALESCE(started_at,NOW()), updated_at=NOW(), error=NULL WHERE id=$1 RETURNING *`, [runId]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function loadGraph(flowId) {
  const [nodes, edges] = await Promise.all([
    pool.query('SELECT node_key,node_type,config FROM crm_flow_nodes WHERE flow_id=$1 ORDER BY id', [flowId]),
    pool.query('SELECT from_node_key,to_node_key,branch_key FROM crm_flow_edges WHERE flow_id=$1 ORDER BY id', [flowId]),
  ]);
  return { nodes: nodes.rows.map((n) => ({ ...n, config: parseJson(n.config) })), edges: edges.rows };
}

async function processOneFlowRun(tenantUid, run) {
  const graph = await loadGraph(run.flow_id);
  const byKey = new Map(graph.nodes.map((node) => [node.node_key, node]));
  const outgoing = new Map();
  for (const edge of graph.edges) { if (!outgoing.has(edge.from_node_key)) outgoing.set(edge.from_node_key, []); outgoing.get(edge.from_node_key).push(edge); }
  const state = parseJson(run.state, {});
  const events = [];
  let current = run.current_node_key;
  let status = 'completed';
  let nextRunAt = null;
  let error = null;
  for (let step = 0; current && step < MAX_STEPS_PER_TICK; step += 1) {
    const node = byKey.get(current);
    if (!node) { error = `Unknown node: ${current}`; status = 'failed'; break; }
    const config = node.config || {};
    let eventType = 'completed';
    if (node.node_type === 'set_field') {
      writePath(state, config.path, config.value);
    } else if (node.node_type === 'send_message') {
      const conversationId = config.conversationId || state.input?.conversationId;
      const body = String(config.body || config.message || '').trim();
      if (!body) { error = 'send_message requires body'; status = 'failed'; break; }
      if (conversationId) {
        await sendReply({ conversationId, text: body, teamUserId: config.teamUserId || null, tenantUid });
        eventType = 'message_sent';
      } else eventType = 'message_recorded';
    } else if (node.node_type === 'delay') {
      const seconds = Math.min(Math.max(Number(config.seconds ?? config.delaySeconds ?? 0), 1), 60 * 60 * 24 * 30);
      status = 'waiting'; nextRunAt = new Date(Date.now() + seconds * 1000); eventType = 'delayed';
    } else if (node.node_type === 'wait_for_reply') {
      if (state.reply || state.input?.reply) eventType = 'reply_received';
      else { status = 'waiting'; nextRunAt = null; eventType = 'waiting_for_reply'; }
    } else if (node.node_type === 'hand_to_human') {
      status = 'paused'; eventType = 'handed_to_human';
    } else if (node.node_type === 'http_request') {
      error = 'http_request nodes require an approved connector and are disabled by default'; status = 'failed'; eventType = 'blocked_action';
    }
    events.push({ nodeKey: current, eventType, payload: { step, nodeType: node.node_type } });
    const next = selectEdges(outgoing.get(current) || [], node, state)[0];
    // A delay advances the cursor before sleeping, otherwise every wake-up
    // would execute the delay node again forever. A reply wait intentionally
    // keeps no cursor and must be resumed by a future inbound event.
    if (node.node_type === 'delay') current = next?.to_node_key || null;
    if (status !== 'completed') break;
    current = next?.to_node_key || null;
  }
  if (status === 'completed' && current) { status = 'waiting'; nextRunAt = new Date(); error = 'Run exceeded step limit'; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const event of events) await client.query('INSERT INTO crm_flow_run_events (run_id,node_key,event_type,payload) VALUES ($1,$2,$3,$4::jsonb)', [run.id, event.nodeKey, event.eventType, JSON.stringify(event.payload)]);
    await client.query(`UPDATE crm_flow_runs SET status=$1,current_node_key=$2,state=$3::jsonb,next_run_at=$4,error=$5,completed_at=CASE WHEN $1 IN ('completed','failed','paused') THEN NOW() ELSE completed_at END,updated_at=NOW() WHERE id=$6 AND tenant_uid=$7`, [status, current, JSON.stringify(state), nextRunAt, error, run.id, tenantUid]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  return { runId: run.id, status, currentNodeKey: current, events: events.length, error };
}

export async function processDueFlowRuns({ tenantUid = null, limit = 20 } = {}) {
  const boundedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const params = tenantUid ? [tenantUid, boundedLimit] : [boundedLimit];
  const where = tenantUid ? `tenant_uid=$1 AND` : '';
  const limitParam = tenantUid ? '$2' : '$1';
  const { rows } = await pool.query(`SELECT id,tenant_uid FROM crm_flow_runs WHERE ${where} status IN ('queued','waiting') AND (next_run_at IS NULL OR next_run_at <= NOW()) ORDER BY COALESCE(next_run_at,created_at),created_at LIMIT ${limitParam}`, params);
  const results = [];
  for (const candidate of rows) {
    const run = await claimFlowRun(candidate.tenant_uid, candidate.id);
    if (!run) continue;
    try { results.push(await processOneFlowRun(candidate.tenant_uid, run)); }
    catch (error) { await pool.query(`UPDATE crm_flow_runs SET status='failed',error=$1,completed_at=NOW(),updated_at=NOW() WHERE id=$2 AND tenant_uid=$3`, [error.message, run.id, candidate.tenant_uid]); results.push({ runId: run.id, status: 'failed', error: error.message }); }
  }
  return results;
}

export { validateGraph };
