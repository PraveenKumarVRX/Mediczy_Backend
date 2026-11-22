import { selectedOptionIds, toSmartCrmQuote, fromSmartCrmQuote, toAppOption, withAppPolicyOptions } from '../services/smartcrm/enrolment-translate.js';

// App <-> SmartCRM enrolment shapes, per SmartCRM's description of its API (2026-11-22, adb2993c).

describe('quote request', () => {
  test("the app's chosen options become SmartCRM's selected_policy_options", () => {
    const appBody = { policyId: '12', sessionId: 's1', selection: { selectedPlanId: 'p', selectedPolicyOptionIds: ['opt-4', 'opt-4', 'topup'], policyOptions: [{ id: 'x' }] } };
    expect(toSmartCrmQuote(appBody)).toEqual({ selected_policy_options: [{ id: 'opt-4' }, { id: 'topup' }] });
  });
  test("a newer app build sending SmartCRM's own selected_policy_options is forwarded as is", () => {
    expect(toSmartCrmQuote({ policyId: '1', selected_policy_options: [{ id: 'opt-4' }] })).toEqual({ selected_policy_options: [{ id: 'opt-4' }] });
    expect(toSmartCrmQuote({ selection: { selected_policy_options: [{ id: 'opt-2' }] } })).toEqual({ selected_policy_options: [{ id: 'opt-2' }] });
  });
  test('falls back to selection.policyOptions ids; refuses junk ids and too many', () => {
    expect(selectedOptionIds({ selection: { policyOptions: [{ id: 7 }, { id: 'b' }] } })).toEqual(['7', 'b']);
    expect(() => selectedOptionIds({ selection: { selectedPolicyOptionIds: ['a b'] } })).toThrow('not valid');
    expect(() => selectedOptionIds({ selection: { selectedPolicyOptionIds: Array.from({ length: 21 }, (_, i) => `o${i}`) } })).toThrow('at most 20');
  });
});

describe('quote reply', () => {
  test('the price is SmartCRM\'s optionalPremiumTotal, rupees, no GST added', () => {
    const out = fromSmartCrmQuote({ success: true, data: { policyNo: 'P1', currency: 'INR', paymentRequired: true, optionalPremiumTotal: 53846,
      options: [{ id: 'opt-4', name: 'Option IV', premium: 53846 }] } });
    expect(out).toEqual({ success: true, data: {
      // SmartCRM's own fields stay for app builds that read them ...
      optionalPremiumTotal: 53846, options: [{ id: 'opt-4', name: 'Option IV', premium: 53846 }],
      // ... and the app-shaped fields are added beside them.
      lines: [{ id: 'opt-4', name: 'Option IV', annual: 53846, days: null, premium: 53846, gst: null, total: 53846 }],
      total: 53846, gstIncluded: false, collectionMode: 'online', currency: 'INR', paymentRequired: true, policyNo: 'P1' } });
  });
  test('the total is never a sum computed here', () => {
    const out = fromSmartCrmQuote({ success: true, data: { optionalPremiumTotal: '1,000', options: [{ id: 'a', premium: 600 }, { id: 'b', premium: 600 }] } });
    expect(out.data.total).toBe(1000);
  });
  test('an error reply is passed on untouched (e.g. SELECTION_GROUP_CONFLICT)', () => {
    const err = { success: false, error: { code: 'SELECTION_GROUP_CONFLICT', message: 'Choose one option from Option I-VIII.' } };
    expect(fromSmartCrmQuote(err)).toBe(err);
  });
});

describe('session options', () => {
  test('each flat-priced bundle becomes one slab, keeping its selection group and benefits', () => {
    expect(toAppOption({ id: 'opt-4', name: 'Option IV', premium: 53846, selectionGroup: 'ghi-modular', participationThresholdPct: 30,
      benefits: [{ name: 'Dental', limit: 100000 }, { name: 'Maternity', limit: 150000 }] })).toEqual({
      id: 'opt-4', name: 'Option IV', type: 'single',
      slabs: [{ id: 'opt-4:flat', familyStructure: null, baseSumInsured: null, premium: 53846, gst: null, prorate: false }],
      selectionGroup: 'ghi-modular', participationThresholdPct: 30,
      benefits: [{ name: 'Dental', limit: 100000, note: null }, { name: 'Maternity', limit: 150000, note: null }],
    });
  });
  test("the session keeps SmartCRM's fields and gains policyOptions", () => {
    const body = { success: true, data: { enrollment_session_token: 't', policy_options: [{ id: 'a', name: 'A', premium: 1 }, { name: 'no id' }] } };
    const out = withAppPolicyOptions(body);
    expect(out.data.enrollment_session_token).toBe('t');
    expect(out.data.policy_options).toBe(body.data.policy_options);
    expect(out.data.policyOptions.map((o) => o.id)).toEqual(['a']);
    expect(withAppPolicyOptions({ success: true, data: {} })).toEqual({ success: true, data: {} });
  });
});
