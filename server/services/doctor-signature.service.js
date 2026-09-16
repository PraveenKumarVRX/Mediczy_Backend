/**
 * Looks up a stored signature scan for a doctor (server/assets/signatures/doctor-<id>.<ext>)
 * and returns it as a base64 data URI ready to embed in an HTML->PDF template.
 * Returns null if no signature is on file — templates fall back to a blank signature line.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIGNATURES_DIR = path.join(__dirname, '../assets/signatures');

const EXT_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export function getDoctorSignatureDataUri(doctorId) {
  if (!doctorId) return null;
  for (const ext of Object.keys(EXT_MIME)) {
    const filePath = path.join(SIGNATURES_DIR, `doctor-${doctorId}${ext}`);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      return `data:${EXT_MIME[ext]};base64,${buf.toString('base64')}`;
    }
  }
  return null;
}
