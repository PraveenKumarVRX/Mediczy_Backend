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

export function instanceToDicomJson(study, inst, pixelTags = null) {
  const seriesUid = inst.series_instance_uid || DEFAULT_SERIES_UID;
  // hg_dicom_instances doesn't store the real SOPClassUID, so this used to always
  // default to CT Image Storage — mislabeling non-image instances (e.g. Presentation
  // State objects, which have no PixelData at all) as displayable images. OHIF would
  // then try to build an image display set and crash loading a frame that can't exist.
  // Real value comes from pixelTags.sopClassUid when the caller parsed the file.
  const sopClassUid = pixelTags?.sopClassUid || inst.sop_class_uid || '1.2.840.10008.5.1.4.1.1.2';
  const cleanPixelTags = { ...(pixelTags || {}) };
  delete cleanPixelTags.sopClassUid;
  const out = {
    '0020000D': tag('UI', inst.study_instance_uid || study.study_instance_uid),
    '0020000E': tag('UI', seriesUid),
    '00080018': tag('UI', inst.sop_instance_uid || inst.sop_uid),
    '00080016': tag('UI', sopClassUid),
    '00080060': tag('CS', inst.modality || study.modality),
    '00200013': tag('IS', inst.instance_number != null ? String(inst.instance_number) : '1'),
    ...cleanPixelTags,
  };
  // tag() returns null for absent values (e.g. PlanarConfiguration on grayscale MR, or
  // any field a non-image instance like a Presentation State object doesn't have) — a
  // literal null VALUE for a present KEY, not an omitted key. OHIF's naturalizeDataset
  // iterates every key and reads `.Value` off each, so a null entry crashes the whole
  // viewer with "Cannot read properties of null" — must omit the key entirely instead.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

/**
 * Rows/Columns/BitsAllocated/PhotometricInterpretation/etc. — without these, cornerstone's
 * WADO-RS image loader has no way to interpret a raw pixel buffer (how many bytes per row,
 * signed vs unsigned, grayscale vs RGB), and fails deep inside pixel post-processing with an
 * opaque "reading 'length' of undefined" rather than a clear "missing Rows/Columns" error.
 * Parsed from the real file at request time since hg_dicom_instances doesn't store these.
 */
export function imagePixelTagsFromBuffer(buffer) {
  try {
    const byteArray = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    const us = (t) => {
      const v = dataSet.uint16(t);
      return v == null ? null : String(v);
    };
    const multi = (t) => {
      const s = dataSet.string(t);
      return s ? s.split('\\').filter((v) => v !== '') : null;
    };
    const transferSyntaxUID = dataSet.string('x00020010') || '1.2.840.10008.1.2.1';
    return {
      sopClassUid: dataSet.string('x00080016') || null, // real SOPClassUID (not a {vr,Value} tag — consumed and stripped by instanceToDicomJson)
      '00020010': tag('UI', transferSyntaxUID), // TransferSyntaxUID
      '00280002': tag('US', us('x00280002')), // SamplesPerPixel
      '00280004': tag('CS', dataSet.string('x00280004')), // PhotometricInterpretation
      '00280006': tag('US', us('x00280006')), // PlanarConfiguration
      '00280008': tag('IS', dataSet.string('x00280008')), // NumberOfFrames
      '00280010': tag('US', us('x00280010')), // Rows
      '00280011': tag('US', us('x00280011')), // Columns
      '00280030': tag('DS', multi('x00280030')), // PixelSpacing
      '00280100': tag('US', us('x00280100')), // BitsAllocated
      '00280101': tag('US', us('x00280101')), // BitsStored
      '00280102': tag('US', us('x00280102')), // HighBit
      '00280103': tag('US', us('x00280103')), // PixelRepresentation
      '00281050': tag('DS', multi('x00281050')), // WindowCenter
      '00281051': tag('DS', multi('x00281051')), // WindowWidth
      '00281052': tag('DS', multi('x00281052')), // RescaleIntercept
      '00281053': tag('DS', multi('x00281053')), // RescaleSlope
    };
  } catch {
    return {};
  }
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

const UNCOMPRESSED_SYNTAXES = new Set([
  '1.2.840.10008.1.2',   // Implicit VR Little Endian
  '1.2.840.10008.1.2.1', // Explicit VR Little Endian
  '1.2.840.10008.1.2.2', // Explicit VR Big Endian (retired)
]);

const TRANSFER_SYNTAX_MIME = {
  '1.2.840.10008.1.2.4.50': 'image/jpeg',
  '1.2.840.10008.1.2.4.51': 'image/jpeg',
  '1.2.840.10008.1.2.4.57': 'image/jpeg',
  '1.2.840.10008.1.2.4.70': 'image/jpeg',
  '1.2.840.10008.1.2.4.80': 'image/x-jls',
  '1.2.840.10008.1.2.4.81': 'image/x-jls',
  '1.2.840.10008.1.2.4.90': 'image/jp2',
  '1.2.840.10008.1.2.4.91': 'image/jp2',
  '1.2.840.10008.1.2.5': 'image/dicom-rle',
};

/**
 * Extract one frame's raw pixel bytes from a full DICOM P10 buffer, for WADO-RS
 * frame retrieval. Cornerstone's image loader expects just the pixel payload
 * (correctly split per-frame and per transfer syntax), not the whole .dcm file —
 * returning the raw file as-is (the prior behavior) decodes as garbage/undefined.
 */
export function extractFramePixelData(buffer, frameNumber = 1) {
  const byteArray = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);
  const transferSyntaxUID = dataSet.string('x00020010') || '1.2.840.10008.1.2.1';
  const pixelDataElement = dataSet.elements.x7fe00010;
  if (!pixelDataElement) return null;

  const contentType = UNCOMPRESSED_SYNTAXES.has(transferSyntaxUID)
    ? 'application/octet-stream'
    : (TRANSFER_SYNTAX_MIME[transferSyntaxUID] || 'application/octet-stream');

  if (pixelDataElement.encapsulatedPixelData) {
    const frame = dicomParser.readEncapsulatedImageFrame(dataSet, pixelDataElement, frameNumber - 1);
    return { bytes: frame, contentType, transferSyntaxUID };
  }

  const numberOfFrames = parseInt(dataSet.string('x00280008') || '1', 10) || 1;
  const frameLength = Math.floor(pixelDataElement.length / numberOfFrames);
  const frameIndex = Math.max(0, Math.min(numberOfFrames - 1, frameNumber - 1));
  const start = pixelDataElement.dataOffset + frameIndex * frameLength;
  const bytes = byteArray.slice(start, start + frameLength);
  return { bytes, contentType, transferSyntaxUID };
}

/** WADO-RS multipart/related response body for one or more frame parts. */
export function buildMultipartRelated(parts) {
  const boundary = `mediczy-wado-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chunks = [];
  for (const part of parts) {
    const transferSyntax = part.transferSyntaxUID ? `; transfer-syntax=${part.transferSyntaxUID}` : '';
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Type: ${part.contentType}${transferSyntax}\r\n\r\n`));
    chunks.push(Buffer.from(part.bytes));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--`));
  return { body: Buffer.concat(chunks), boundary };
}
