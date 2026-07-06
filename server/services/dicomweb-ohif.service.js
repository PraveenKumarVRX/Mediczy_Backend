/**
 * DICOMweb helpers for OHIF viewer compatibility.
 * Converts HyperGrid DB rows → application/dicom+json (QIDO-RS)
 * and builds standard WADO-RS paths.
 */
import dicomParser from 'dicom-parser';

export const DEFAULT_SERIES_UID = '2.25.1';

export function wantsDicomJson(req) {
  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('application/dicom+json') || accept.includes('application/json+dicom');
}

export function tag(vr, value) {
  if (value == null || value === '') return null;
  const vals = Array.isArray(value) ? value.filter((v) => v != null && v !== '') : [value];
  if (!vals.length) return null;
  return { vr, Value: vals };
}

export function pnTag(name) {
  if (!name) return null;
  return { vr: 'PN', Value: [{ Alphabetic: String(name) }] };
}

export function formatDicomDate(d) {
  if (!d) return null;
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return s.replace(/-/g, '');
}

export function studyToDicomJson(study, instanceCount = 0) {
  const uid = study.study_instance_uid || study.study_uid;
  const modalities = study.modality
    ? [study.modality]
    : (Array.isArray(study.modalities) ? study.modalities : []);
  const out = {
    '0020000D': tag('UI', uid),
    '00100020': tag('LO', study.patient_id ? String(study.patient_id) : undefined),
    '00100010': pnTag(study.patient_name),
    '00080020': tag('DA', formatDicomDate(study.study_date)),
    '00080030': tag('TM', study.study_time || undefined),
    '00080060': tag('CS', modalities[0] || study.modality),
    '00081030': tag('LO', study.study_description),
    '00080050': tag('SH', study.accession_number),
    '00201208': tag('IS', String(instanceCount || study.num_instances || 0)),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

export function seriesToDicomJson(study, seriesUid, instances = []) {
  const modality = instances[0]?.modality || study.modality || 'OT';
  return {
    '0020000D': tag('UI', study.study_instance_uid || study.study_uid),
    '0020000E': tag('UI', seriesUid),
    '00080060': tag('CS', modality),
    '00201209': tag('IS', String(instances.length)),
    '0008103E': tag('LO', study.study_description || seriesUid),
  };
}

export function instanceToDicomJson(study, inst) {
  const seriesUid = inst.series_instance_uid || DEFAULT_SERIES_UID;
  return {
    '0020000D': tag('UI', inst.study_instance_uid || study.study_instance_uid),
    '0020000E': tag('UI', seriesUid),
    '00080018': tag('UI', inst.sop_instance_uid || inst.sop_uid),
    '00080016': tag('UI', inst.sop_class_uid || '1.2.840.10008.5.1.4.1.1.2'),
    '00080060': tag('CS', inst.modality || study.modality),
    '00200013': tag('IS', inst.instance_number != null ? String(inst.instance_number) : '1'),
  };
}

export function groupInstancesBySeries(instances) {
  const map = new Map();
  for (const inst of instances) {
    const seriesUid = inst.series_instance_uid || DEFAULT_SERIES_UID;
    if (!map.has(seriesUid)) map.set(seriesUid, []);
    map.get(seriesUid).push(inst);
  }
  return map;
}

export function parseDicomBuffer(buffer) {
  try {
    const byteArray = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    const get = (tag) => dataSet.string(tag) || null;
    const studyUid = get('x0020000d') || `2.25.${Date.now()}`;
    const seriesUid = get('x0020000e') || `2.25.${Date.now()}.1`;
    const sopUid = get('x00080018') || `2.25.${Date.now()}.${Math.random().toString().slice(2, 8)}`;
    return {
      studyInstanceUID: studyUid,
      seriesInstanceUID: seriesUid,
      sopInstanceUID: sopUid,
      sopClassUID: get('x00080016'),
      patientId: get('x00100020'),
      patientName: get('x00100010'),
      modality: get('x00080060'),
      studyDate: get('x00080020'),
      studyDescription: get('x00081030'),
      accessionNumber: get('x00080050'),
      instanceNumber: parseInt(get('x00200013') || '1', 10) || 1,
    };
  } catch {
    return null;
  }
}

export function wadoInstancePath(studyUid, seriesUid, sopUid) {
  return `/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(seriesUid)}/instances/${encodeURIComponent(sopUid)}`;
}
