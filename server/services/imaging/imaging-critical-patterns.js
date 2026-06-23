/** Critical finding patterns for imaging alerts (shared, testable). */
export const CRITICAL_PATTERNS = [
  { pattern: /pneumothorax/i, type: 'pneumothorax', label: 'Pneumothorax' },
  { pattern: /intracranial.?bleed|ich|subdural|epidural|hemorrhage/i, type: 'ich', label: 'Intracranial hemorrhage' },
  { pattern: /stroke|large.?vessel.?occlusion|lvo/i, type: 'stroke', label: 'Acute stroke' },
  { pattern: /pulmonary.?embol|large.?pe/i, type: 'pe', label: 'Pulmonary embolism' },
  { pattern: /aortic.?dissection/i, type: 'aortic_dissection', label: 'Aortic dissection' },
  { pattern: /tension.?pneumothorax/i, type: 'tension_pneumothorax', label: 'Tension pneumothorax' },
];
