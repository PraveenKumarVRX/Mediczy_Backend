// Reuses signed medication reconciliation. A historical prescription is not a current-medication assertion.
export async function getChatMedicationReference({ organizationId, patientId }, service = null) {
  if (!organizationId) return { status: 'unavailable', items: [] };
  try {
    const reconciliations = service || await import('./med-reconciliation.service.js');
    const rows = await reconciliations.listForPatient({ organizationId, patientId, userId: patientId });
    const signed = rows.find(row => row.status === 'signed' && Number.isFinite(Date.parse(row.signed_at)) && Date.parse(row.signed_at)<=Date.now());
    if (!signed) return { status: 'unavailable', items: [] };
    const record = await reconciliations.getReconciliation({ organizationId, id: signed.id, userId: patientId });
    if (!record || Number(record.patient_id)!==Number(patientId) || Number(record.organization_id)!==Number(organizationId) || record.status!=='signed') return { status:'unavailable',items:[] };
    return { status:'signed_reference', signedAt:record.signed_at, sourceId:record.id,
      items:(record.items||[]).slice(0,30).map(item=>({sourceItemId:item.id,name:item.home_medicine,decision:item.action})),
      limitation:'Signed decisions are historical source facts, not instructions to start, stop or change medication.' };
  } catch { return { status:'unavailable',items:[] }; }
}
