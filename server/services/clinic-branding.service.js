/**
 * Looks up a stored clinic/tenant logo (server/assets/branding/tenant-<id>.<ext>)
 * and returns it as a base64 data URI for direct embedding in an HTML->PDF
 * template. Returns null if no logo is on file — templates fall back to the
 * generic inline SVG mark.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRANDING_DIR = path.join(__dirname, '../assets/branding');

const EXT_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

export function getClinicLogoDataUri(tenantId) {
  if (!tenantId) return null;
  for (const ext of Object.keys(EXT_MIME)) {
    const filePath = path.join(BRANDING_DIR, `tenant-${tenantId}${ext}`);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      return `data:${EXT_MIME[ext]};base64,${buf.toString('base64')}`;
    }
  }
  return null;
}
