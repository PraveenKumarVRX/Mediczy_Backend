import { beforeAll, describe, expect, it } from '@jest/globals';
import zlib from 'zlib';
import crypto from 'crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';

function buildSecureQrBytes(fields, photoLen = 0) {
  const chunks = [];
  fields.forEach((f, i) => {
    chunks.push(Buffer.from(String(f), 'utf8'));
    if (i < fields.length - 1) chunks.push(Buffer.from([0xff]));
  });
  if (photoLen > 0) {
    chunks.push(Buffer.from([0xff]));
    chunks.push(crypto.randomBytes(photoLen));
  }
  return zlib.deflateRawSync(Buffer.concat(chunks));
}

const DEMO = [
  'xxxx1234',
  'Anita Sharma',
  '15/08/1990',
  'F',
  'W/O Ravi',
  'Pune',
  '',
  '12',
  '',
  '411001',
  'Pune',
  'Maharashtra',
  'MG Road',
  '',
  'Pune',
];

describe('aadhaar image decode (server zxing-wasm)', () => {
  let decodeAadhaarFromImageBytes;

  beforeAll(async () => {
    ({ decodeAadhaarFromImageBytes } = await import('../services/aadhaar-image-decode.service.js'));
  });

  it('decodes Aadhaar Secure QR digits from a generated PNG', async () => {
    const raw = buildSecureQrBytes(DEMO);
    const decimal = BigInt(`0x${raw.toString('hex')}`).toString(10);

    const png = await QRCode.toBuffer(decimal, {
      type: 'png',
      errorCorrectionLevel: 'M',
      width: 800,
      margin: 2,
    });

    const result = await decodeAadhaarFromImageBytes(png);
    expect(result.success).toBe(true);
    expect(result.fields.firstName).toBe('Anita');
    expect(result.fields.aadhaarLast4).toBe('1234');
    expect(result.engine).toBe('server-zxing-wasm');
  }, 30000);

  it('decodes binary-mode Secure QR (real Aadhaar card encoding) from phone-like JPEG', async () => {
    const raw = buildSecureQrBytes(DEMO, 400);
    const png = await QRCode.toBuffer([{ data: new Uint8Array(raw), mode: 'byte' }], {
      type: 'png',
      errorCorrectionLevel: 'L',
      width: 1000,
      margin: 2,
    });
    const jpeg = await sharp(png).resize(900).jpeg({ quality: 78 }).toBuffer();

    const result = await decodeAadhaarFromImageBytes(jpeg);
    expect(result.success).toBe(true);
    expect(result.fields.firstName).toBe('Anita');
    expect(result.fields.aadhaarLast4).toBe('1234');
  }, 60000);
});
