/**
 * Which request paths parse their own multipart body with multer.
 *
 * express-fileupload is mounted globally and consumes the request stream. A
 * route that then runs multer gets an already-drained body and busboy fails
 * with "Unexpected end of form" — so every multer route must be listed here,
 * or its uploads break with an error that names nothing useful.
 *
 * Kept out of app.js so it can be tested: the list was previously inline and
 * a new multer route was added to it only when someone remembered.
 */
import { NURSING_IMAGE_UPLOAD_PATHS } from './nursing-upload-paths.js';

/** Exact paths, matched as themselves or as a prefix with a `/` boundary. */
export const MULTER_UPLOAD_PATHS = Object.freeze([
  ...NURSING_IMAGE_UPLOAD_PATHS,
  '/api/offline-scribe/transcribe',
  '/api/offline-scribe/full-pipeline',
  '/api/recordings/upload',
  '/api/ai/vision/analyze',
  '/api/scribe/transcribe',
  '/api/v3/ai-brain/documents',
  '/api/cdss/knowledge/upload',
  '/api/corporate-bookings/reports/upload',
  '/api/team/emails/send',
  '/api/crm/rfqs/upload-excel',
  '/api/crm/rfqs',
  '/api/clinic/register',
  '/api/lab/register',
  '/api/pharmacy/register',
  '/api/homecare/register',
  '/api/ambulance/register',
  '/api/hospital/register',
  '/api/corporate/register',
  '/api/doctor/chat/upload',
  '/api/doctors/imaging/upload',
  '/api/lab/ris/upload',
  '/api/hypergrid/dicom/studies', // STOW-RS multer — express-fileupload must not drain body first
  '/api/voice-assistant/stt',     // multer memoryStorage — must not be pre-consumed by express-fileupload
]);

/** Paths with a dynamic segment, so they cannot be matched as a literal prefix. */
export const MULTER_UPLOAD_PATTERNS = Object.freeze([
  // A file attached to a Team email template: POST .../templates/<uuid>/attachments
  { method: 'POST', pattern: /^\/api\/team\/emails\/templates\/[^/]+\/attachments$/ },
  // Doctor media upload
  { method: 'POST', pattern: /^\/api\/doctors\/upload\/[^/]+$/ },
  // POST /api/reports (root) uses multer, while /api/reports/upload uses express-fileupload
  { method: 'POST', pattern: /^\/api\/reports$/ },
]);

/** True when this request parses its own body and express-fileupload must stand aside. */
export function usesMulter(requestPath, method = 'GET') {
  const path = String(requestPath || '');
  if (MULTER_UPLOAD_PATHS.some(p => path === p || path.startsWith(`${p}/`))) return true;
  const verb = String(method || 'GET').toUpperCase();
  return MULTER_UPLOAD_PATTERNS.some(rule => rule.method === verb && rule.pattern.test(path));
}

export default { MULTER_UPLOAD_PATHS, MULTER_UPLOAD_PATTERNS, usesMulter };
