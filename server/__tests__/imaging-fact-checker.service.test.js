import { checkClaimsAgainstReport } from '../services/imaging/imaging-fact-checker.service.js';

describe('imaging-fact-checker.service (P9)', () => {
  test('the master architecture doc\'s own worked example: right kidney 12mm claimed, report says left/15mm -> BLOCK with both issues', () => {
    const claims = [{ claim_id: 'CLM-F-1', subject: 'right_kidney_lesion', predicate: 'size', object_value: 12 }];
    const draftText = 'FINDINGS: Left kidney lesion measuring 15mm. IMPRESSION: Recommend follow-up.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('BLOCK');
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['LATERALITY_MISMATCH', 'MEASUREMENT_MISMATCH']));
  });

  test('a correctly stated claim (matching side and value) passes clean', () => {
    const claims = [{ claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', predicate: 'volume', object_value: 641.2 }];
    const draftText = 'FINDINGS: The left lateral ventricle measures 641.2 mm3, uncertain.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('PASS');
    expect(result.issues).toHaveLength(0);
  });

  test('a value within rounding tolerance (641.2 -> 641) does not false-positive', () => {
    const claims = [{ claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', predicate: 'volume', object_value: 641.2 }];
    const draftText = 'FINDINGS: The left lateral ventricle measures approximately 641 mm3.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('PASS');
  });

  test('a real value mismatch (right, correct side, wrong number) is caught without a false laterality flag', () => {
    const claims = [{ claim_id: 'CLM-F-2', subject: 'right_lateral_ventricle', predicate: 'volume', object_value: 3977.9 }];
    const draftText = 'FINDINGS: The right lateral ventricle measures 2000 mm3.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('BLOCK');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('MEASUREMENT_MISMATCH');
  });

  test('a subject the report never mentions produces no issue — evidence-coverage gate\'s job, not this one\'s', () => {
    const claims = [{ claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', predicate: 'volume', object_value: 641.2 }];
    const draftText = 'FINDINGS: No abnormality detected.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('PASS');
    expect(result.issues).toHaveLength(0);
  });

  test('a non-lateralized subject (e.g. a tumor subregion) is never checked for laterality', () => {
    const claims = [{ claim_id: 'CLM-F-1', subject: 'segmented_whole_tumor', predicate: 'volume', object_value: 120 }];
    const draftText = 'FINDINGS: The segmented whole tumor region measures 120 mm3, low confidence.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('PASS');
  });

  test('a sentence with no number at all produces no measurement issue (nothing to compare)', () => {
    const claims = [{ claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', predicate: 'volume', object_value: 641.2 }];
    const draftText = 'FINDINGS: The left lateral ventricle appears grossly unremarkable.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('PASS');
  });

  test('multiple claims are each checked independently — one bad claim does not suppress checking a good one', () => {
    const claims = [
      { claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', predicate: 'volume', object_value: 641.2 },
      { claim_id: 'CLM-F-2', subject: 'right_lateral_ventricle', predicate: 'volume', object_value: 3977.9 },
    ];
    const draftText = 'FINDINGS: The left lateral ventricle measures 641.2 mm3. The right lateral ventricle measures 9999 mm3.';
    const result = checkClaimsAgainstReport(draftText, claims);
    expect(result.status).toBe('BLOCK');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].claim_id).toBe('CLM-F-2');
  });

  describe('paired-measurement regression (real study-11 false positive)', () => {
    // Real bug: a single, correctly-written sentence stating both bilateral
    // values together — "right=3977.9mm3 vs. left=641.2mm3" — false-
    // positived the left claim. Two independent causes, both real: (1) the
    // sentence-boundary detector misread the period in "vs." as ending the
    // sentence, splitting the left value out of the sentence entirely; (2)
    // even within one correctly-bounded sentence, "does ANY number match"
    // can't tell which of two numbers belongs to which side.
    test('a real captured LLM sentence stating both sides via "X vs. Y" passes for both claims', () => {
      const draftText = 'FINDINGS: There is ventricular asymmetry, as evidenced by a larger right lateral ' +
        'ventricle compared to the left one (right=3977.9mm3 vs. left=641.2 mm^3). The ratio between them ' +
        'indicates an asymmetric size difference.';
      const claims = [
        { claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', object_value: 641.2 },
        { claim_id: 'CLM-F-2', subject: 'right_lateral_ventricle', object_value: 3977.9 },
      ];
      const result = checkClaimsAgainstReport(draftText, claims);
      expect(result.status).toBe('PASS');
      expect(result.issues).toHaveLength(0);
    });

    test('one sentence naming both sides still catches a real swap — the fix does not weaken real detection', () => {
      const draftText = 'FINDINGS: the left kidney measures 12mm vs. the right kidney measures 8mm.';
      const claims = [{ claim_id: 'CLM-X', subject: 'right_kidney', object_value: 12 }];
      const result = checkClaimsAgainstReport(draftText, claims);
      expect(result.status).toBe('BLOCK');
      expect(result.issues[0].code).toBe('MEASUREMENT_MISMATCH');
    });

    test('a genuine "X vs Y" swap (right claimed but left has that value) still BLOCKs', () => {
      const draftText = 'FINDINGS: left lateral ventricle measures 3977.9mm3 vs. right lateral ventricle measures 641.2mm3.';
      const claims = [{ claim_id: 'CLM-F-2', subject: 'right_lateral_ventricle', object_value: 3977.9 }];
      const result = checkClaimsAgainstReport(draftText, claims);
      expect(result.status).toBe('BLOCK');
      expect(result.issues[0].code).toBe('MEASUREMENT_MISMATCH');
    });

    test('a real captured LLM sentence with the qualifier AFTER the value ("641.2mm3 on the left side") also passes for both claims', () => {
      // Second real case, surfaced verifying the RAG-context fix live: the
      // side qualifier can legitimately come AFTER its number ("...on the
      // left side") just as often as before it ("left kidney measures").
      // A first attempt at this fix (nearest PRECEDING side word only)
      // confidently mis-attributed this exact sentence — worse than the
      // original bug, since it produced a wrong answer instead of falling
      // back to "uncertain". Fixed by taking the nearest side word in
      // either direction.
      const draftText = 'FINDINGS: Ventricular asymmetry was observed, as evidenced by differences between ' +
        'left and right lateral ventricle volumes of 641.2 mm3 on the left side versus 3977.9 mm3 on the right side.';
      const claims = [
        { claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', object_value: 641.2 },
        { claim_id: 'CLM-F-2', subject: 'right_lateral_ventricle', object_value: 3977.9 },
      ];
      const result = checkClaimsAgainstReport(draftText, claims);
      expect(result.status).toBe('PASS');
      expect(result.issues).toHaveLength(0);
    });

    test('"vs." elsewhere in the report does not merge two genuinely separate sentences into one', () => {
      // Regression guard on the sentence-boundary fix itself: a real
      // sentence boundary right after "vs." content must still be found —
      // only the abbreviation's own period is exempted, not sentence-ending
      // periods that happen to follow shortly after.
      const draftText = 'FINDINGS: pre- vs. post-contrast imaging was reviewed. The left lateral ventricle measures 641.2 mm3.';
      const claims = [{ claim_id: 'CLM-F-1', subject: 'left_lateral_ventricle', object_value: 641.2 }];
      const result = checkClaimsAgainstReport(draftText, claims);
      expect(result.status).toBe('PASS');
    });
  });
});
