/**
 * GAP-KIOSK-007 — Video liveness / ID verification: NOT IMPLEMENTED
 *
 * No liveness-detection vendor is integrated yet (candidates: AWS Rekognition
 * Face Liveness, FaceTec, Onfido). This previously returned a fake pass based
 * only on whether frames/an ID image were present, without analyzing content
 * — that has been removed because it provided no real identity assurance
 * while looking like it did. Fails closed until a real vendor is wired.
 * Currently unused by any client (no frontend calls
 * POST /api/display/kiosk/liveness), so this fails closed with no impact on
 * an existing workflow.
 */
export function assessKioskLiveness({ frames = [], idImageBase64 = null }) {
  return {
    passed: false,
    score: 0,
    reason: 'NOT_IMPLEMENTED',
    message: 'Liveness verification is not yet available — no vendor integrated.',
  };
}
