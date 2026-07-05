/**
 * Hospital OS — ambient documentation pipeline status + approval routing
 */
import { createApproval } from './approval-inbox.service.js';

export async function routeAmbientDocument({
  documentType,
  title,
  content,
  patientId,
  requestedBy,
  metadata = {},
  tenantId = 'default',
}) {
  const riskTier = documentType === 'prescription' || documentType === 'discharge' ? 'T1' : 'T1';
  const approval = await createApproval({
    tenantId,
    approvalType: `ambient_${documentType}`,
    title: title || `Ambient ${documentType}`,
    summary: (content || '').slice(0, 500),
    draftPayload: { documentType, content, metadata },
    patientId,
    requestedBy,
    riskTier,
    source: 'ambient-scribe',
  });

  return {
    approvalId: approval.id,
    status: 'pending_review',
    message: 'Document routed to clinician approval inbox',
    tier: riskTier,
  };
}

export function getAmbientPipelineStatus() {
  return {
    components: {
      offlineScribe: { status: 'operational', path: '/api/offline-scribe' },
      scribeStream: { status: 'operational', path: '/api/scribe/stream' },
      approvalInbox: { status: 'operational', path: '/api/v3/hospital-os/approvals' },
    },
    humanFinalRequired: true,
  };
}

export default { routeAmbientDocument, getAmbientPipelineStatus };
