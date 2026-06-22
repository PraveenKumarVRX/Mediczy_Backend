/**
 * GAP-KIOSK-007 — Video liveness / ID verification stub (extensible to vendor SDK)
 */
export function assessKioskLiveness({ frames = [], idImageBase64 = null }) {
  if (!frames?.length && !idImageBase64) {
    return { passed: false, score: 0, reason: 'NO_CAPTURE' };
  }
  const motionScore = frames.length >= 2 ? 0.85 : 0.4;
  const idScore = idImageBase64 ? 0.9 : 0.7;
  const score = (motionScore + idScore) / 2;
  return {
    passed: score >= 0.65,
    score: Math.round(score * 100) / 100,
    reason: score >= 0.65 ? 'OK' : 'LOW_CONFIDENCE',
    vendor: 'mediqzy-on-device-v1',
  };
}
