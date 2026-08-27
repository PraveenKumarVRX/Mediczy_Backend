/**
 * Post-ingest hooks — workflow, triage, VNA, search index, Kafka events.
 */
import { startWorkflow, transitionWorkflow, getWorkflowForStudy } from './imaging-workflow.service.js';
import { requestTriage } from './imaging-triage.service.js';
import { registerVnaObject } from './imaging-vna.service.js';
import { indexStudyDocument } from './imaging-search.service.js';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';

export async function onDicomStudyIngested({
  study,
  tenantId,
  orthancResult,
  s3Key,
  skipTriage = false,
}) {
  if (!study?.study_instance_uid || !study?.is_dicom) return null;

  await registerVnaObject({
    tenantId,
    studyInstanceUID: study.study_instance_uid,
    s3Key,
    orthancId: orthancResult?.orthancStudyId || null,
    storageTier: 'hot',
  }).catch(() => {});

  const instance = await startWorkflow({
    studyId: study.id,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
    priority: (study.priority || 'routine').toLowerCase(),
    payload: { modality: study.modality, accessionNumber: study.accession_number },
  });

  await publishEvent(KAFKA_TOPICS.IMAGING_STUDY_STORED, {
    studyId: study.id,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
    workflowInstanceId: instance.id,
  }).catch(() => {});

  runAsyncTriagePipeline({
    instanceId: instance.id,
    studyId: study.id,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
    modality: study.modality,
    orthancStudyId: orthancResult?.orthancStudyId,
    patientName: study.patient_name,
    studyDate: study.study_date,
    reportText: study.report_text,
    skipTriage,
  });

  return instance;
}

function runAsyncTriagePipeline(ctx) {
  setImmediate(async () => {
    try {
      await transitionWorkflow(ctx.instanceId, 'ai_analysis', { id: null, name: 'system' });
      // Skipped when the caller couldn't yet confirm the study's real
      // modality (e.g. the first DICOM instance ingested had no Modality
      // tag) — running triage under an unconfirmed/placeholder modality
      // produces a mislabeled result that gets cached and silently reused
      // by every later AI report draft for this study.
      if (!ctx.skipTriage) {
        await requestTriage({
          studyId: ctx.studyId,
          studyInstanceUID: ctx.studyInstanceUID,
          tenantId: ctx.tenantId,
          modality: ctx.modality,
          orthancStudyId: ctx.orthancStudyId,
        });
      }
      await transitionWorkflow(ctx.instanceId, 'assigned', { id: null, name: 'system' });
      await indexStudyDocument({
        tenantId: ctx.tenantId,
        studyInstanceUID: ctx.studyInstanceUID,
        patientName: ctx.patientName,
        modality: ctx.modality,
        studyDate: ctx.studyDate,
        reportText: ctx.reportText || '',
      });
    } catch (err) {
      console.warn('[ImagingIngest] async pipeline:', err?.message || err);
    }
  });
}

export async function getStudyPlatformSummary(studyId) {
  const wf = await getWorkflowForStudy(studyId);
  return { workflow: wf };
}
