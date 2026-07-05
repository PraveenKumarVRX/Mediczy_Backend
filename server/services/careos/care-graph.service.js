/**
 * CareOS — Care Graph (relationship network)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-ecosystem.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function upsertNode({ nodeType, externalId, organizationId, label, metadata = {} }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_graph_nodes (node_type, external_id, organization_id, label, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (node_type, external_id, organization_id)
     DO UPDATE SET label = EXCLUDED.label, metadata = careos_graph_nodes.metadata || EXCLUDED.metadata
     RETURNING *`,
    [nodeType, String(externalId), organizationId || null, label, JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function linkNodes({ fromNodeId, toNodeId, relationship, weight = 1, metadata = {} }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_graph_edges (from_node_id, to_node_id, relationship, weight, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (from_node_id, to_node_id, relationship) DO UPDATE SET weight = EXCLUDED.weight
     RETURNING *`,
    [fromNodeId, toNodeId, relationship, weight, JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function getPatientSubgraph(patientId, organizationId, depth = 2) {
  await ensure();
  const patientNode = await upsertNode({
    nodeType: 'patient',
    externalId: patientId,
    organizationId,
    label: `Patient ${patientId}`,
  });

  const { rows: edges } = await pool.query(
    `SELECT e.*, nf.node_type AS from_type, nf.label AS from_label,
            nt.node_type AS to_type, nt.label AS to_label
     FROM careos_graph_edges e
     JOIN careos_graph_nodes nf ON nf.id = e.from_node_id
     JOIN careos_graph_nodes nt ON nt.id = e.to_node_id
     WHERE e.from_node_id = $1 OR e.to_node_id = $1
     LIMIT 200`,
    [patientNode.id]
  );

  return {
    center: patientNode,
    edges,
    depth,
    nodeCount: edges.length,
  };
}

export async function seedPatientGraph(patientId, organizationId, { doctors = [], conditions = [], medications = [] } = {}) {
  const patientNode = await upsertNode({ nodeType: 'patient', externalId: patientId, organizationId, label: `Patient ${patientId}` });

  for (const d of doctors) {
    const docNode = await upsertNode({ nodeType: 'doctor', externalId: d.id || d.userId, organizationId, label: d.name || `Doctor ${d.id}` });
    await linkNodes({ fromNodeId: patientNode.id, toNodeId: docNode.id, relationship: 'treated_by' });
  }
  for (const c of conditions) {
    const condNode = await upsertNode({ nodeType: 'condition', externalId: c.code || c.name, organizationId: null, label: c.name || c.code });
    await linkNodes({ fromNodeId: patientNode.id, toNodeId: condNode.id, relationship: 'has_condition' });
  }
  for (const m of medications) {
    const medNode = await upsertNode({ nodeType: 'medication', externalId: m.name, organizationId: null, label: m.name });
    await linkNodes({ fromNodeId: patientNode.id, toNodeId: medNode.id, relationship: 'on_medication' });
  }

  return getPatientSubgraph(patientId, organizationId);
}

export default { upsertNode, linkNodes, getPatientSubgraph, seedPatientGraph };
