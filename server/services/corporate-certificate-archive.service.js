import fs from 'node:fs/promises';
import JSZip from 'jszip';

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// Export existing issued documents only. Never synthesize an unsigned certificate.
export async function buildCertificateArchive({ ids, corporateId, findCertificates, resolvePath, fileName, loadPdf }) {
  const validId = id => (typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n)
    || (typeof id === 'number' && Number.isSafeInteger(id) && id > 0);
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !validId(id))) {
    throw fail('Select between 1 and 100 certificate PDFs', 400);
  }
  const uniqueIds = [...new Set(ids.map(String))];
  const certificates = await findCertificates(corporateId, uniqueIds);
  if (certificates.length !== uniqueIds.length || certificates.some(cert => Number(cert.organization_id) !== Number(corporateId) || !uniqueIds.includes(String(cert.id)))) {
    throw fail('One or more certificates are unavailable', 404);
  }
  const zip = new JSZip();
  let totalBytes = 0;
  for (const cert of certificates) {
    let bytes = loadPdf ? await loadPdf(cert) : null;
    if (bytes) {
      totalBytes += bytes.length;
    } else {
      const path = resolvePath(cert);
      let stat;
      try { stat = await fs.stat(path); } catch { throw fail('One or more certificate PDFs are unavailable', 409); }
      if (!stat.isFile()) throw fail('One or more certificate PDFs are unavailable', 409);
      if (totalBytes + stat.size > 25 * 1024 * 1024) throw fail('Selection exceeds 25 MB. Download fewer certificates at a time.', 413);
      bytes = await fs.readFile(path);
      totalBytes += bytes.length;
    }
    if (totalBytes > 25 * 1024 * 1024) throw fail('Selection exceeds 25 MB. Download fewer certificates at a time.', 413);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw fail('One or more certificate files are not valid PDFs', 409);
    const safeName = String(fileName(cert)).replace(/[^A-Za-z0-9._-]/g, '-');
    zip.file(`${cert.id}-${safeName}`, bytes);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}
