import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeRecord, computeQc, foldKey, normalizeProviderType,
  REQUIRED_FIELDS, RECOMMENDED_FIELDS,
} from '../routes/provider-network-bot.route.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('spreadsheet headers are written for people', () => {
  it('folds a header to a comparable key', () => {
    expect(foldKey('Lab Name')).toBe('lab_name');
    expect(foldKey('Pin Code')).toBe('pin_code');
    expect(foldKey('Contact No.')).toBe('contact_no');
    expect(foldKey('  STATE  ')).toBe('state');
    expect(foldKey('No. of Employees')).toBe('no_of_employees');
  });

  it('reads the real 101-row lab list that previously parsed to nothing', () => {
    // The exact shape of the sheet a team member uploaded: every lookup missed,
    // so each row was stored blank and failed QC on all six required fields.
    const row = {
      SLNO: 3,
      State: 'Andhra Pradesh',
      'Lab Name': 'Likitha-- Guntur',
      Location: 'Guntur',
      'Lab price': 3200,
      'Mayden price': 4950,
      'No of employees': 'Ahamadali Shaik',
    };
    const parsed = normalizeRecord(row, { provider_type: 'lab' });
    expect(parsed.name).toBe('Likitha-- Guntur');
    expect(parsed.city).toBe('Guntur');
    expect(parsed.state).toBe('Andhra Pradesh');
    expect(parsed.provider_type).toBe('lab');
  });

  it('keeps the original row, so commercial columns are not lost', () => {
    const row = { 'Lab Name': 'X', State: 'TN', Location: 'Chennai', 'Lab price': 3200 };
    expect(normalizeRecord(row).metadata['Lab price']).toBe(3200);
  });

  it('understands the usual ways a name column is written', () => {
    for (const header of ['Name', 'Lab Name', 'Hospital Name', 'Centre Name',
      'Center Name', 'Clinic Name', 'Provider Name', 'Facility Name', 'Partner Name']) {
      expect(normalizeRecord({ [header]: 'Acme' }).name).toBe('Acme');
    }
  });

  it('understands the usual ways a place is written', () => {
    expect(normalizeRecord({ City: 'Pune' }).city).toBe('Pune');
    expect(normalizeRecord({ Town: 'Pune' }).city).toBe('Pune');
    expect(normalizeRecord({ District: 'Pune' }).city).toBe('Pune');
    expect(normalizeRecord({ Location: 'Pune' }).city).toBe('Pune');
  });

  it('treats Location as a town, not as a street address', () => {
    // "Guntur" is where the lab is, not where to post a letter. Passing it off
    // as an address would make an entry look complete when it is not.
    const parsed = normalizeRecord({ 'Lab Name': 'L', Location: 'Guntur', State: 'AP' });
    expect(parsed.city).toBe('Guntur');
    expect(parsed.address).toBe('');
  });

  it('reads contact and pincode columns however they are labelled', () => {
    expect(normalizeRecord({ 'Contact No.': '9876543210' }).phone).toBe('9876543210');
    expect(normalizeRecord({ 'Mobile No': '9876543210' }).phone).toBe('9876543210');
    expect(normalizeRecord({ 'Email ID': 'a@b.com' }).email).toBe('a@b.com');
    expect(normalizeRecord({ 'Pin Code': '500055' }).pincode).toBe('500055');
    expect(normalizeRecord({ PINCODE: '500055' }).pincode).toBe('500055');
  });

  it('lets an exact header win over a variant', () => {
    const parsed = normalizeRecord({ name: 'Exact', 'Lab Name': 'Variant' });
    expect(parsed.name).toBe('Exact');
  });

  it('falls back to the type chosen on the form, and a row still overrides it', () => {
    expect(normalizeRecord({ 'Lab Name': 'A' }, { provider_type: 'lab' }).provider_type).toBe('lab');
    expect(normalizeRecord({ 'Lab Name': 'A', Type: 'hospital' }, { provider_type: 'lab' }).provider_type).toBe('hospital');
    expect(normalizeProviderType('Hospitals')).toBe('hospital');
  });

  it('survives an empty or malformed row', () => {
    for (const row of [{}, null, undefined]) {
      expect(() => normalizeRecord(row)).not.toThrow();
      expect(normalizeRecord(row).name).toBe('');
    }
  });
});

describe('quality control has three outcomes, not two', () => {
  const complete = {
    provider_type: 'lab', name: 'Acme Labs', city: 'Pune', state: 'MH',
    address: '12 Main St', pincode: '411001', phone: '9876543210',
  };

  it('requires only what identifies and places a partner', () => {
    expect(REQUIRED_FIELDS).toEqual(['provider_type', 'name', 'city', 'state']);
    expect(RECOMMENDED_FIELDS).toEqual(['address', 'pincode']);
  });

  it('passes a complete entry', () => {
    expect(computeQc(complete).status).toBe('PASS');
    expect(computeQc(complete).missing).toEqual([]);
  });

  it('warns, rather than rejects, when only address, pincode or contact are absent', () => {
    // This is the whole 101-row lab list: name, town and state and nothing else.
    const thin = { provider_type: 'lab', name: 'Acme', city: 'Pune', state: 'MH' };
    const qc = computeQc(thin);
    expect(qc.status).toBe('WARN');
    expect(qc.missingRequired).toEqual([]);
    expect(qc.missing).toEqual(expect.arrayContaining(['address', 'pincode', 'contact(phone_or_email)']));
  });

  it('fails an entry that cannot be identified or placed', () => {
    expect(computeQc({ provider_type: 'lab', city: 'Pune', state: 'MH' }).status).toBe('FAIL');
    expect(computeQc({ provider_type: 'lab', name: 'Acme', state: 'MH' }).status).toBe('FAIL');
  });

  it('still reports everything absent, so warning hides nothing', () => {
    const qc = computeQc({ provider_type: 'lab', name: 'Acme', city: 'Pune', state: 'MH' });
    expect(qc.missing.length).toBeGreaterThan(qc.missingRequired.length);
  });

  it('scores a complete entry above a thin one', () => {
    const thin = { provider_type: 'lab', name: 'Acme', city: 'Pune', state: 'MH' };
    expect(computeQc(complete).score).toBeGreaterThan(computeQc(thin).score);
  });
});

describe('the route publishes what it should', () => {
  const src = read('routes/provider-network-bot.route.js');

  it('publishes complete and warned entries, and forces only for failures', () => {
    expect(src).toContain("AND qc_status IN ('PASS', 'WARN')");
  });

  it('adds one partner through the same pipeline as a bulk upload', () => {
    expect(src).toContain("router.post('/providers'");
    expect(src).toContain('await persistRecords(batchId');
    expect(src).toContain('await runQc(batchId)');
    expect(src).toContain('await publishBatch(batchId');
  });

  it('refuses a single partner that cannot be identified, naming what is missing', () => {
    expect(src).toContain('PROVIDER_INCOMPLETE');
    expect(src).toContain('missingRequired');
  });

  it('lets a spreadsheet declare its provider type, since lists rarely carry one', () => {
    expect(src).toContain("normalizeProviderType(req.body?.provider_type || 'other')");
    expect(src).toContain('normalizeRecord(row, { provider_type: defaultType })');
  });

  it('reports which columns it understood, so a mismapped sheet is visible', () => {
    expect(src).toContain('recognisedFields');
    expect(src).toContain('unmappedColumns');
  });
});

describe('a lab list with only a street address (Team QA 2026-11-21)', () => {
  it('reads a "Lab Address" column, and any other *_address heading', async () => {
    const { normalizeRecord: n } = await import('../routes/provider-network-bot.route.js');
    const row = { 'SL NO': 2, 'Lab Name': 'Likitha Diagnostics', 'Lab Address': 'MIG 252 Road no : 4 KPHB colony Hyderabad -500072', Pincode: '500072' };
    expect(n(row, { provider_type: 'lab' })).toMatchObject({ name: 'Likitha Diagnostics', address: row['Lab Address'], pincode: '500072' });
    expect(n({ 'Diagnostic Centre Address': 'Plot 4, Guntur' }).address).toBe('Plot 4, Guntur');
  });

  it('knows the state from a pincode only where the prefix is unambiguous', async () => {
    const { stateFromPincode } = await import('../routes/provider-network-bot.route.js');
    expect(stateFromPincode('500072')).toBe('Telangana');
    expect(stateFromPincode('515001')).toBe('Andhra Pradesh');
    expect(stateFromPincode('403001')).toBe('Goa');
    expect(stateFromPincode('411007')).toBe('Maharashtra');
    expect(stateFromPincode('248001')).toBeNull(); // UP / Uttarakhand share the prefix
    expect(stateFromPincode('5000')).toBeNull();
  });

  it('force publish still refuses a row it cannot tell apart from its siblings', () => {
    const src = read('routes/provider-network-bot.route.js');
    expect(src).toContain("AND (COALESCE(TRIM(city), '') <> '' OR COALESCE(TRIM(address), '') <> '')");
    expect(src).toContain('await fillPlaceFromAddress(records);');
  });
});
