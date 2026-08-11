/**
 * DICOM uses short codes (MR, CR, DX, US…) while clinical UIs use labels
 * (MRI, X-Ray, USG…). Expand a filter value into all DB aliases.
 */
export function expandModalityFilter(modality) {
  const raw = String(modality || '').trim().toUpperCase();
  if (!raw) return [];
  const aliases = {
    MR: ['MR', 'MRI'],
    MRI: ['MR', 'MRI'],
    CT: ['CT'],
    US: ['US', 'USG', 'ULTRASOUND'],
    USG: ['US', 'USG', 'ULTRASOUND'],
    ULTRASOUND: ['US', 'USG', 'ULTRASOUND'],
    CR: ['CR', 'DX', 'X-RAY', 'XRAY', 'XR'],
    DX: ['CR', 'DX', 'X-RAY', 'XRAY', 'XR'],
    'X-RAY': ['CR', 'DX', 'X-RAY', 'XRAY', 'XR'],
    XRAY: ['CR', 'DX', 'X-RAY', 'XRAY', 'XR'],
    XR: ['CR', 'DX', 'X-RAY', 'XRAY', 'XR'],
    XA: ['XA', 'CATHLAB', 'ANGIO'],
    CATHLAB: ['XA', 'CATHLAB', 'ANGIO'],
    PT: ['PT', 'PET'],
    PET: ['PT', 'PET'],
    NM: ['NM'],
    MG: ['MG', 'MAMMO'],
    MAMMO: ['MG', 'MAMMO'],
  };
  return aliases[raw] || [raw];
}

export default { expandModalityFilter };
