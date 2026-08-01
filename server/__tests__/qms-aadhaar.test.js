import { beforeAll, describe, expect, it } from '@jest/globals';
import zlib from 'zlib';

beforeAll(() => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-qms-jwt-secret-not-for-prod';
  }
});

function buildSecureQrBytes(fields) {
  const chunks = [];
  fields.forEach((f, i) => {
    chunks.push(Buffer.from(String(f), 'utf8'));
    if (i < fields.length - 1) chunks.push(Buffer.from([0xff]));
  });
  return zlib.deflateRawSync(Buffer.concat(chunks));
}

describe('QMS portal defaults', () => {
  it('maps hospital / clinic / lab zones and departments', async () => {
    const { QMS_PORTAL_DEFAULTS } = await import('../config/qms.config.js');
    expect(QMS_PORTAL_DEFAULTS.hospital).toMatchObject({
      department: 'opd',
      queueZone: 'opd-waiting',
    });
    expect(QMS_PORTAL_DEFAULTS.clinic).toMatchObject({
      department: 'opd',
      queueZone: 'clinic-waiting',
    });
    expect(QMS_PORTAL_DEFAULTS.lab).toMatchObject({
      department: 'lab',
      queueZone: 'lab-waiting',
    });
  });
});

describe('Aadhaar Secure QR parse (QMS)', () => {
  it('extracts demographics and last-4 only from Secure QR bytes', async () => {
    const { parseAadhaarQr } = await import('../services/aadhaar-qr.service.js');

    const raw = buildSecureQrBytes([
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
    ]);

    const parsed = parseAadhaarQr(raw);
    expect(parsed.success).toBe(true);
    expect(parsed.fields.fullName).toBe('Anita Sharma');
    expect(parsed.fields.firstName).toBe('Anita');
    expect(parsed.fields.lastName).toBe('Sharma');
    expect(parsed.fields.gender).toBe('female');
    expect(parsed.fields.dateOfBirth).toBe('1990-08-15');
    expect(parsed.fields.aadhaarLast4).toBe('1234');
    expect(parsed.fields.pincode).toBe('411001');
    expect(parsed.fields.state).toBe('Maharashtra');
    expect(JSON.stringify(parsed.fields)).not.toMatch(/\d{12}/);
  });

  it('rejects empty / non-aadhaar payloads', async () => {
    const { parseAadhaarQr } = await import('../services/aadhaar-qr.service.js');
    expect(parseAadhaarQr(Buffer.alloc(0)).success).toBe(false);
    expect(parseAadhaarQr(Buffer.from('hello')).success).toBe(false);
  });

  it('parses Secure QR from decimal digit string (modern Aadhaar encoding)', async () => {
    const { parseAadhaarQrInput, decimalStringToBuffer } = await import('../services/aadhaar-qr.service.js');
    const raw = buildSecureQrBytes([
      'xxxx9876',
      'Ravi Kumar',
      '01/01/1985',
      'M',
      '',
      'Delhi',
      '',
      '1',
      '',
      '110001',
      'Delhi',
      'Delhi',
      'CP',
      '',
      'Delhi',
    ]);
    // Round-trip: bytes → BigInt decimal string → parse
    const decimal = BigInt(`0x${raw.toString('hex')}`).toString(10);
    expect(decimalStringToBuffer(decimal).equals(raw)).toBe(true);
    const parsed = parseAadhaarQrInput({ qrText: decimal });
    expect(parsed.success).toBe(true);
    expect(parsed.fields.fullName).toBe('Ravi Kumar');
    expect(parsed.fields.aadhaarLast4).toBe('9876');
    expect(parsed.fields.gender).toBe('male');
  });

  it('parses Secure QR from base64 bytes and latin1 qrText fallback', async () => {
    const { parseAadhaarQrInput } = await import('../services/aadhaar-qr.service.js');
    const raw = buildSecureQrBytes([
      'xxxx5555',
      'Meera Shah',
      '12/12/1992',
      'F',
      '',
      'Surat',
      '',
      '9',
      '',
      '395001',
      'Surat',
      'Gujarat',
      'Ring Rd',
      '',
      'Surat',
    ]);
    const fromB64 = parseAadhaarQrInput({ qrBytesBase64: raw.toString('base64') });
    expect(fromB64.success).toBe(true);
    expect(fromB64.fields.fullName).toBe('Meera Shah');

    const latin1 = raw.toString('latin1');
    const fromLatin1 = parseAadhaarQrInput({ qrText: latin1 });
    expect(fromLatin1.success).toBe(true);
    expect(fromLatin1.fields.aadhaarLast4).toBe('5555');
  });

  it('accepts 17-field layout with version prefix', async () => {
    const { parseAadhaarQr } = await import('../services/aadhaar-qr.service.js');
    const raw = buildSecureQrBytes([
      '2', // version
      '0', // email/mobile indicator
      'ref4321',
      'Sita Devi',
      '20/03/1978',
      'F',
      '',
      'Jaipur',
      '',
      '',
      '',
      '302001',
      '',
      'Rajasthan',
      '',
      '',
      'Jaipur',
    ]);
    const parsed = parseAadhaarQr(raw);
    expect(parsed.success).toBe(true);
    expect(parsed.fields.fullName).toBe('Sita Devi');
    expect(parsed.fields.aadhaarLast4).toBe('4321');
  });
});
