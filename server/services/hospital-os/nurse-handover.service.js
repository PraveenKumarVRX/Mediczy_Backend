/** Complete-census SBAR drafts. AI is opt-in and cannot finalize a handover. */
import { withNursingContext, nursingQuery } from '../nursing-context.service.js';
import { QueryTypes } from 'sequelize';
import { wardSnapshot } from '../nursing-workflow.service.js';
import llmProvider from '../ai-brain/llm-provider.js';
export async function generateShiftHandover({ wardId, organizationId, actorId, role, shift = 'day' }) {
    const snapshot = await withNursingContext({ organizationId, actorId, role }, () => wardSnapshot(wardId));
    const fallback = { sbar: { situation: `${snapshot.patientCount} active admissions require shift handover`, background: 'Review each patient chart and current orders.', assessment: 'Review the recorded observations, completeness and overdue care before signing.', recommendation: 'Complete patient-level SBAR and obtain incoming acknowledgment.' }, priorityPatients: snapshot.patients.filter(p => p.pending.some(t => t.priority === 'stat') || Number(p.vitals?.news2_score) >= 3).map(p => p.id), tasks: snapshot.patients.flatMap(p => p.pending.map(t => ({ admissionId: p.id, ...t }))) };
    const settings = await withNursingContext({ organizationId, actorId, role }, () => nursingQuery('SELECT ai_enabled FROM nursing_facility_settings WHERE organization_id=:org', { replacements: { org: organizationId }, type: QueryTypes.SELECT }));
    let handover = fallback, provider = 'deterministic', aiUnavailable = false;
    if (settings[0]?.ai_enabled) {
        try {
            const response = await llmProvider.chat({ messages: [{ role: 'system', content: 'Draft a nursing SBAR from the supplied complete ward snapshot. Never infer missing clinical findings. Output JSON with sbar, priorityPatients, tasks. All output requires nurse review.' }, { role: 'user', content: JSON.stringify({ shift, patientCount: snapshot.patientCount, patients: snapshot.patients.map(p => ({ admissionId: p.id, bed: p.bed_number, vitals: p.vitals ? { recordedAt: p.vitals.recorded_at, pulse: p.vitals.pulse, systolic: p.vitals.bp_systolic, respiratoryRate: p.vitals.respiratory_rate, spo2: p.vitals.spo2, temperature: p.vitals.temperature, news2: p.vitals.news2_score, complete: p.vitals.news2_complete } : null, pending: p.pending, medications: p.medications })) }) }], temperature: 0.2, maxTokens: 2000, responseFormat: { type: 'json_object' }, skipCache: true });
            const parsed = JSON.parse(response.content || '{}');
            if (!parsed.sbar || !['situation', 'background', 'assessment', 'recommendation'].every(k => typeof parsed.sbar[k] === 'string'))
                throw new Error('Incomplete AI draft');
            const validIds = new Set(snapshot.patients.map(p => Number(p.id)));
            handover = { ...parsed, priorityPatients: Array.isArray(parsed.priorityPatients) ? parsed.priorityPatients.filter(id => validIds.has(Number(id))) : [] };
            provider = response.provider;
        }
        catch {
            aiUnavailable = true;
        }
    }
    return { ...snapshot, shift, handover, provider, aiUnavailable, reviewRequired: true, canSign: false };
}
export default { generateShiftHandover };
