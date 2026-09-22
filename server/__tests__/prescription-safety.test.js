import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: {} }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { transaction: jest.fn(), query: jest.fn() }, default: {} }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext: jest.fn() }));
jest.unstable_mockModule('../services/cims-medicine.service.js', () => ({
  default: {
    medicines: [
      { brandName: 'Augmentin 625', _brandLower: 'augmentin 625', genericName: 'Amoxicillin + Clavulanic Acid', _genericLower: 'amoxicillin + clavulanic acid', composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg', pregnancy: 'Category B' },
      { brandName: 'Voveran', _brandLower: 'voveran', genericName: 'Diclofenac', _genericLower: 'diclofenac', composition: 'Diclofenac 50mg', pregnancy: 'Category D' },
      { brandName: 'Zyloric', _brandLower: 'zyloric', genericName: 'Allopurinol', _genericLower: 'allopurinol', composition: 'Allopurinol 100mg', pregnancy: 'Category C' },
      { brandName: 'Thalix', _brandLower: 'thalix', genericName: 'Thalidomide', _genericLower: 'thalidomide', composition: 'Thalidomide 50mg', pregnancy: 'Category X' },
      { brandName: 'Dolo 650', _brandLower: 'dolo 650', genericName: 'Paracetamol', _genericLower: 'paracetamol', composition: 'Paracetamol 650mg', pregnancy: 'Category B' },
      { brandName: 'Calpol', _brandLower: 'calpol', genericName: 'Paracetamol', _genericLower: 'paracetamol', composition: 'Paracetamol 500mg', pregnancy: 'Category B' },
    ],
  },
}));

const { evaluatePrescriptionSafety, matchAllergy, parseDose, splitItems } = await import('../services/prescription-safety.service.js');
const { classesOfGenerics, resolveGenerics, normaliseDrugText } = await import('../services/drug-class.service.js');

// Same shape as the drafts seeded by the migration, as they look once a medical director has approved them.
const CLASSES = [
  { classKey: 'penicillin', label: 'Penicillins', members: ['amoxicillin', 'ampicillin', 'penicillin v', 'piperacillin', 'cloxacillin', 'benzylpenicillin'], brandAliases: ['augmentin', 'mox'], crossReactsWith: ['cephalosporin'] },
  { classKey: 'cephalosporin', label: 'Cephalosporins', members: ['cefixime', 'cefuroxime', 'ceftriaxone', 'cephalexin', 'cefpodoxime'], brandAliases: [], crossReactsWith: ['penicillin'] },
  { classKey: 'sulfonamide', label: 'Sulfonamides', members: ['sulfamethoxazole', 'sulfadiazine', 'cotrimoxazole', 'co-trimoxazole'], brandAliases: ['septran'], crossReactsWith: [] },
  { classKey: 'nsaid', label: 'NSAIDs', members: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'ketorolac'], brandAliases: ['brufen', 'voveran'], crossReactsWith: [] },
].map((c) => ({ ...c }));

const allergy = (name, extra = {}) => ({ allergen_name: name, allergen_type: 'drug', severity: 'SEVERE', reaction_type: 'anaphylaxis', drug_class: null, ...extra });
const run = (over) => evaluatePrescriptionSafety({ allergyStatus: 'no_known_allergy', classes: CLASSES, ...over });
const codes = (items) => items.map((i) => i.code).sort();

describe('name resolution', () => {
  it('strips strengths and forms', () => { expect(normaliseDrugText('Amoxicillin 500 mg Capsules')).toBe('amoxicillin'); });
  it('resolves a catalogue brand to its generic and composition', () => {
    const g = resolveGenerics('Augmentin 625');
    expect(g).toEqual(expect.arrayContaining(['amoxicillin', 'clavulanic acid']));
  });
  it('splits combination text', () => { expect(resolveGenerics('amoxicillin + clavulanic acid')).toEqual(expect.arrayContaining(['amoxicillin', 'clavulanic acid'])); });
  it('assigns approved classes, and none when no class is approved', () => {
    expect(classesOfGenerics(['amoxicillin'], CLASSES)).toEqual(['penicillin']);
    expect(classesOfGenerics(['amoxicillin'], [])).toEqual([]);
  });
  it('parses doses', () => {
    expect(parseDose('500 mg')).toEqual({ value: 500, unit: 'mg' });
    expect(parseDose('1 g')).toEqual({ value: 1, unit: 'g' });
    expect(parseDose('take twice')).toBeNull();
  });
});

describe('allergy rules (table-driven)', () => {
  const cases = [
    ['exact generic', [allergy('Amoxicillin')], 'Amoxicillin 500mg', ['ALLERGY_MATCH']],
    ['exact generic, different case and strength', [allergy('AMOXICILLIN')], 'amoxicillin 250 mg tab', ['ALLERGY_MATCH']],
    ['brand resolves to the allergic generic', [allergy('Amoxicillin')], 'Augmentin 625', ['ALLERGY_MATCH']],
    ['class allergy blocks a class member', [allergy('Penicillin')], 'Amoxicillin 500', ['ALLERGY_MATCH']],
    ['class allergy blocks a brand alias of a member', [allergy('Penicillin')], 'Augmentin 625', ['ALLERGY_MATCH']],
    ['drug_class recorded on the allergy blocks members', [allergy('Rash with antibiotics', { drug_class: 'penicillin' })], 'Ampicillin 500', ['ALLERGY_MATCH']],
    ['penicillin allergy warns on cephalosporin (cross-reaction)', [allergy('Penicillin')], 'Cefixime 200', ['ALLERGY_CROSS_REACTION']],
    ['cephalosporin allergy warns on penicillin', [allergy('Ceftriaxone')], 'Amoxicillin 500', ['ALLERGY_CROSS_REACTION']],
    ['NSAID class allergy blocks diclofenac brand', [allergy('Ibuprofen')], 'Voveran', ['ALLERGY_MATCH']],
    ['sulfa allergy blocks co-trimoxazole', [allergy('Sulfonamide')], 'Septran DS', ['ALLERGY_MATCH']],
    ['unrelated allergy does not match', [allergy('Amoxicillin')], 'Paracetamol 500mg', []],
    ['food allergy is not a drug allergy', [allergy('Penicillin', { allergen_type: 'food' })], 'Amoxicillin 500', []],
    ['short allergen text is ignored', [allergy('ab')], 'Abacavir', []],
  ];
  it.each(cases)('%s', (_n, allergies, drug, expected) => {
    const items = run({ allergyStatus: 'known', allergies, medications: [{ name: drug, dosage: '500 mg' }] });
    expect(codes(items)).toEqual(expected);
  });

  it('with NO approved classes only the exact substance matches (draft classes have no effect)', () => {
    const noClasses = (drug) => evaluatePrescriptionSafety({ allergyStatus: 'known', classes: [], allergies: [allergy('Penicillin')], medications: [{ name: drug, dosage: '500 mg' }] });
    expect(codes(noClasses('Amoxicillin 500'))).toEqual([]);
    expect(codes(noClasses('Penicillin V 250'))).toEqual(['ALLERGY_MATCH']);
  });
  it('allergy match is a blocker and cross reaction is a warning', () => {
    const a = splitItems(run({ allergyStatus: 'known', allergies: [allergy('Amoxicillin')], medications: [{ name: 'Amoxicillin', dosage: '500 mg' }] }));
    expect(a.blockers).toHaveLength(1);
    const b = splitItems(run({ allergyStatus: 'known', allergies: [allergy('Penicillin')], medications: [{ name: 'Cefixime', dosage: '200 mg' }] }));
    expect(b.blockers).toHaveLength(0); expect(b.warnings).toHaveLength(1);
  });
  it('the message names the allergy and severity', () => {
    const [i] = run({ allergyStatus: 'known', allergies: [allergy('Amoxicillin')], medications: [{ name: 'Amoxicillin', dosage: '500 mg' }] });
    expect(i.message).toMatch(/Amoxicillin/); expect(i.message).toMatch(/severe/);
  });
  it('matchAllergy returns null for a non-drug allergen', () => {
    expect(matchAllergy(allergy('Latex', { allergen_type: 'latex' }), { name: 'x', generics: ['latex'], classes: [] }, CLASSES)).toBeNull();
  });
});

describe('allergy status', () => {
  const med = [{ name: 'Paracetamol 500', dosage: '500 mg' }];
  it('unknown status is NEVER treated as safe: warning that needs acknowledgement', () => {
    const [i] = run({ allergyStatus: 'unknown', medications: med });
    expect(i.code).toBe('ALLERGY_STATUS_UNKNOWN'); expect(i.severity).toBe('warning'); expect(i.requiresAcknowledgement).toBe(true);
  });
  it('recorded no-known-allergy is clean', () => { expect(run({ allergyStatus: 'no_known_allergy', medications: med })).toEqual([]); });
  it('a failed lookup is a blocker', () => {
    const [i] = run({ allergyStatus: 'lookup_failed', medications: med });
    expect(i.code).toBe('ALLERGY_LOOKUP_FAILED'); expect(i.severity).toBe('blocker');
  });
});

describe('interactions', () => {
  const m = (...names) => names.map((n) => ({ name: n, dosage: '10 mg' }));
  it('flags a major interaction between two new drugs', () => {
    const items = run({ medications: m('Warfarin', 'Ibuprofen') });
    expect(items.some((i) => i.code === 'INTERACTION' && i.severity === 'warning')).toBe(true);
  });
  it('flags a contraindicated pair as a blocker', () => {
    const items = run({ medications: m('Sertraline', 'Selegiline') });
    expect(items.find((i) => i.code === 'INTERACTION').severity).toBe('blocker');
  });
  it('checks a new drug against the patient\'s current medicines', () => {
    const items = run({ medications: m('Ibuprofen'), currentMedications: ['Warfarin 5mg'] });
    expect(items.some((i) => i.code === 'INTERACTION')).toBe(true);
  });
  it('does not flag two current medicines against each other (only pairs with a new drug)', () => {
    expect(run({ medications: m('Paracetamol'), currentMedications: ['Warfarin', 'Aspirin'] }).some((i) => i.code === 'INTERACTION')).toBe(false);
  });
  it('reports each pair once', () => {
    expect(run({ medications: m('Warfarin', 'Ibuprofen') }).filter((i) => i.code === 'INTERACTION' && /bleeding/i.test(i.evidence)).length).toBe(1);
  });
});

describe('drug-condition, duplicates, pregnancy, dose', () => {
  it('metformin with a renal problem warns', () => {
    const [i] = run({ medications: [{ name: 'Metformin', dosage: '500 mg' }], conditions: ['Chronic kidney disease'] });
    expect(i.code).toBe('DRUG_CONDITION');
  });
  it('an ACE inhibitor with pregnancy in the problem list is a blocker', () => {
    const items = run({ medications: [{ name: 'Enalapril', dosage: '5 mg' }], conditions: ['Pregnancy'] });
    expect(items.find((i) => i.code === 'DRUG_CONDITION').severity).toBe('blocker');
  });
  it('no condition, no drug-condition alert', () => { expect(run({ medications: [{ name: 'Metformin', dosage: '500 mg' }] })).toEqual([]); });
  it('duplicate therapy inside the same prescription (brand + generic)', () => {
    const items = run({ medications: [{ name: 'Dolo 650', dosage: '650 mg' }, { name: 'Paracetamol 500', dosage: '500 mg' }] });
    expect(codes(items)).toEqual(['DUPLICATE_THERAPY']); expect(items[0].severity).toBe('blocker');
  });
  it('duplicate against a current medicine', () => {
    expect(run({ medications: [{ name: 'Calpol', dosage: '500 mg' }], currentMedications: ['Paracetamol 500mg'] }).some((i) => i.code === 'DUPLICATE_THERAPY')).toBe(true);
  });
  it('different drugs are not duplicates', () => { expect(run({ medications: [{ name: 'Paracetamol', dosage: '500 mg' }, { name: 'Cefixime', dosage: '200 mg' }] })).toEqual([]); });
  it('pregnancy category X is a blocker, D a warning, B nothing', () => {
    expect(run({ pregnant: true, medications: [{ name: 'Thalix', dosage: '50 mg' }] })[0]).toMatchObject({ code: 'PREGNANCY_CONTRAINDICATED', severity: 'blocker' });
    expect(run({ pregnant: true, medications: [{ name: 'Voveran', dosage: '50 mg' }] }).find((i) => i.code === 'PREGNANCY_CAUTION').severity).toBe('warning');
    expect(run({ pregnant: true, medications: [{ name: 'Dolo 650', dosage: '650 mg' }] })).toEqual([]);
  });
  it('pregnancy rules do not fire when not pregnant', () => { expect(run({ pregnant: false, medications: [{ name: 'Thalix', dosage: '50 mg' }] })).toEqual([]); });
  it('missing dose warns; an extreme dose blocks; a normal dose is clean', () => {
    expect(run({ medications: [{ name: 'Paracetamol', dosage: '' }] })[0].code).toBe('DOSE_MISSING');
    expect(run({ medications: [{ name: 'Paracetamol', dosage: '50 g' }] })[0]).toMatchObject({ code: 'DOSE_EXTREME', severity: 'blocker' });
    expect(run({ medications: [{ name: 'Paracetamol', dosage: '0 mg' }] })[0].code).toBe('DOSE_EXTREME');
    expect(run({ medications: [{ name: 'Paracetamol', dosage: '650 mg' }] })).toEqual([]);
  });
  it('plain-string medications are supported and skip the dose check', () => { expect(run({ medications: ['Paracetamol 500'] })).toEqual([]); });
  it('empty input yields nothing when status is recorded', () => { expect(run({ medications: [] })).toEqual([]); });
});
