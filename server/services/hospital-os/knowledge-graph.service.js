/**
 * Hospital OS — semantic knowledge graph (patient · diagnosis · med · lab · guideline)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/hospital-os-2035.migration.js';
import { getPatientWorkspace } from '../clinical-workspace.service.js';

let ready = false;

async function ensureTables() {
  if (ready) return;
  await migrate();
  ready = true;
}

async function upsertNode(tenantId, nodeType, externalId, label, attributes = {}) {
  const { rows } = await pool.query(
    `INSERT INTO hospital_os_kg_nodes (tenant_id, node_type, external_id, label, attributes)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (tenant_id, node_type, external_id)
     DO UPDATE SET label = EXCLUDED.label, attributes = EXCLUDED.attributes, updated_at = NOW()
     RETURNING id`,
    [tenantId, nodeType, String(externalId), label || null, JSON.stringify(attributes)]
  );
  return rows[0].id;
}

async function upsertEdge(tenantId, fromId, toId, relation, evidence = {}) {
  await pool.query(
    `INSERT INTO hospital_os_kg_edges (tenant_id, from_node_id, to_node_id, relation, evidence)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (tenant_id, from_node_id, to_node_id, relation) DO NOTHING`,
    [tenantId, fromId, toId, relation, JSON.stringify(evidence)]
  );
}

export async function buildPatientSubgraph(patientId, organizationId, tenantId = 'default') {
  await ensureTables();
  const workspace = await getPatientWorkspace(patientId, organizationId);
  const patientNodeId = await upsertNode(tenantId, 'patient', patientId, workspace?.patient?.name || `Patient ${patientId}`, {
    age: workspace?.patient?.age,
    gender: workspace?.patient?.gender,
  });

  const edges = [];

  for (const allergy of workspace?.allergies || []) {
    const nid = await upsertNode(tenantId, 'allergy', allergy.id || allergy.name, allergy.name || allergy.allergen);
    await upsertEdge(tenantId, patientNodeId, nid, 'HAS_ALLERGY', { severity: allergy.severity });
    edges.push({ relation: 'HAS_ALLERGY', target: allergy.name });
  }

  for (const med of workspace?.medications || []) {
    const nid = await upsertNode(tenantId, 'medication', med.id || med.name, med.name || med.drug_name);
    await upsertEdge(tenantId, patientNodeId, nid, 'TAKES', { dose: med.dose, frequency: med.frequency });
    edges.push({ relation: 'TAKES', target: med.name || med.drug_name });
  }

  for (const dx of workspace?.diagnoses || workspace?.activeProblems || []) {
    const label = dx.description || dx.condition || dx.name;
    const nid = await upsertNode(tenantId, 'diagnosis', dx.code || label, label, { code: dx.code });
    await upsertEdge(tenantId, patientNodeId, nid, 'HAS_DIAGNOSIS', {});
    edges.push({ relation: 'HAS_DIAGNOSIS', target: label });
  }

  return {
    patientId,
    nodeId: patientNodeId,
    edgeCount: edges.length,
    edges,
    workspaceSummary: {
      admission: workspace?.admission?.ward || null,
      ewsAlerts: workspace?.alerts?.length || 0,
      pendingOrders: workspace?.pendingOrders?.length || 0,
    },
  };
}

export async function queryGraph({ tenantId = 'default', nodeType, externalId, depth = 1 }) {
  await ensureTables();
  const { rows: nodes } = await pool.query(
    `SELECT * FROM hospital_os_kg_nodes WHERE tenant_id = $1 AND node_type = $2 AND external_id = $3`,
    [tenantId, nodeType, String(externalId)]
  );
  if (!nodes[0]) return { nodes: [], edges: [] };

  const { rows: edges } = await pool.query(
    `SELECT e.*, fn.label AS from_label, tn.label AS to_label, fn.node_type AS from_type, tn.node_type AS to_type
     FROM hospital_os_kg_edges e
     JOIN hospital_os_kg_nodes fn ON fn.id = e.from_node_id
     JOIN hospital_os_kg_nodes tn ON tn.id = e.to_node_id
     WHERE e.tenant_id = $1 AND (e.from_node_id = $2 OR e.to_node_id = $2)
     LIMIT 100`,
    [tenantId, nodes[0].id]
  );

  return { nodes, edges, depth };
}

export async function searchNodes({ tenantId = 'default', query, nodeTypes = [], limit = 20 }) {
  await ensureTables();
  const params = [tenantId, `%${query}%`];
  let typeClause = '';
  if (nodeTypes.length) {
    params.push(nodeTypes);
    typeClause = ` AND node_type = ANY($${params.length})`;
  }
  params.push(Math.min(limit, 50));
  const { rows } = await pool.query(
    `SELECT * FROM hospital_os_kg_nodes
     WHERE tenant_id = $1 AND (label ILIKE $2 OR external_id ILIKE $2)${typeClause}
     ORDER BY updated_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

export default { buildPatientSubgraph, queryGraph, searchNodes };
