/**
 * Translation between the My SmartHealth app's enrolment shapes and SmartCRM's partner API.
 *
 * Built from SmartCRM's own description of its API (2026-11-22, commit adb2993c); no live
 * example exists yet because no policy uses these options. Only the quote and the session's
 * add-on options are translated so far; the other calls still pass through unchanged.
 *
 * App (app/Utils/enrolmentApi.js)                 SmartCRM partner API
 *   POST quote {policyId, sessionId, selection}  ->  {selected_policy_options: [{id}]}
 *     selection.selectedPolicyOptionIds[]
 *   (or SmartCRM's own selected_policy_options, which newer app builds send: forwarded as is)
 *   reply {lines[], total, gstIncluded, ...}     <-  {success, data: {policyNo, options[],
 *                                                       optionalPremiumTotal, currency, paymentRequired}}
 *   session policyOptions[{id, name, type,        <-  data.policy_options[{id, name, premium (flat,
 *     slabs[{id, premium, gst, prorate}]}]               whole bundle), benefits[], selectionGroup,
 *                                                       participationThresholdPct}]
 *
 * Amounts are rupees on both sides. From SmartCRM e03534de an option may carry a GST rate: quote then
 * returns priced lines with gst, a gstTotal, and an optionalPremiumTotal that includes GST, plus the
 * payment methods (paymentModes, paymentMode, paymentModeRequired, salaryDeduction), all kept as sent.
 * The member's payment_mode (online | payroll; the app's 'salary' = payroll) is forwarded.
 * The price always comes from SmartCRM's optionalPremiumTotal; nothing here adds premiums up.
 * Replies keep every SmartCRM field and add the app-shaped ones, so either app shape works.
 */
import { SmartCrmError } from './config.js';

const MAX_OPTIONS = 20;
const OPTION_ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const text = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const dataOf = (body) => (body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : null);

/** The option ids the member chose, from the app's quote body. */
export function selectedOptionIds(appBody) {
  const b = appBody && typeof appBody === 'object' ? appBody : {};
  const sel = b.selection && typeof b.selection === 'object' ? b.selection : b;
  // Newer app builds already send SmartCRM's own shape; older ones send the app's.
  const native = Array.isArray(b.selected_policy_options) ? b.selected_policy_options
    : Array.isArray(sel.selected_policy_options) ? sel.selected_policy_options : null;
  const raw = native ? native.map((o) => (o && typeof o === 'object' ? o.id : o))
    : Array.isArray(sel.selectedPolicyOptionIds) ? sel.selectedPolicyOptionIds
      : Array.isArray(sel.policyOptions) ? sel.policyOptions.map((o) => o?.id) : [];
  const ids = [...new Set(raw.map((v) => (v === null || v === undefined ? '' : String(v).trim())).filter(Boolean))];
  if (ids.length > MAX_OPTIONS) throw new SmartCrmError('BAD_REQUEST', `Choose at most ${MAX_OPTIONS} options.`, 400);
  if (ids.some((id) => !OPTION_ID.test(id))) throw new SmartCrmError('BAD_REQUEST', 'An option id is not valid.', 400);
  return ids;
}

// SmartCRM's payment methods: online, or payroll (salary deduction; the app calls it 'salary').
const PAYMENT_MODE = { online: 'online', payroll: 'payroll', salary: 'payroll' };

/** The payment method the member chose, if any: payment_mode, or the app's collectionMode. */
export function paymentModeOf(appBody) {
  const b = appBody && typeof appBody === 'object' ? appBody : {};
  const sel = b.selection && typeof b.selection === 'object' ? b.selection : {};
  const raw = b.payment_mode ?? sel.payment_mode ?? b.collectionMode ?? sel.collectionMode;
  if (raw === undefined || raw === null || raw === '') return null;
  const mode = PAYMENT_MODE[String(raw).toLowerCase()];
  if (!mode) throw new SmartCrmError('PAYMENT_MODE_NOT_OFFERED', 'Choose online payment or salary deduction.', 400);
  return mode;
}

/** App quote body -> SmartCRM quote body. */
export function toSmartCrmQuote(appBody) {
  const mode = paymentModeOf(appBody);
  return { selected_policy_options: selectedOptionIds(appBody).map((id) => ({ id })), ...(mode ? { payment_mode: mode } : {}) };
}

/** SmartCRM quote reply -> what the app's normalizeQuote reads. Non-200 replies are left alone. */
export function fromSmartCrmQuote(body) {
  const d = dataOf(body);
  if (!d || body.success === false) return body;
  const total = num(d.optionalPremiumTotal);
  // SmartCRM's own priced lines (with proration and GST) when it sends them (e03534de onwards);
  // otherwise one line per chosen option, as before.
  const priced = Array.isArray(d.lines) && d.lines.length;
  const lines = (priced ? d.lines : Array.isArray(d.options) ? d.options : []).slice(0, MAX_OPTIONS).map((o) => {
    const premium = num(o?.premium ?? o?.amount);
    const gst = priced ? num(o?.gst) : null;
    return {
      id: text(o?.id === undefined || o?.id === null ? '' : String(o.id), 100), name: text(o?.name) || 'Add-on cover',
      annual: priced ? num(o?.annual ?? o?.annual_premium) ?? null : premium,
      days: priced ? num(o?.prorata_days ?? o?.days) : null,
      premium, gst, total: priced ? num(o?.total) ?? (premium !== null ? premium + (gst || 0) : null) : premium,
    };
  });
  const gstTotal = num(d.gstTotal);
  const mode = String(d.paymentMode || '').toLowerCase();
  // SmartCRM's own fields stay (optionalPremiumTotal, options, ...) for app builds that read them;
  // the app-shaped fields are added beside them.
  return {
    ...body,
    success: true,
    data: {
      ...d,
      lines,
      total,
      // optionalPremiumTotal includes GST once SmartCRM adds it; before that there was none.
      // true once SmartCRM adds GST; null (unknown, not 'no GST') when it sends none (app request).
      gstIncluded: gstTotal !== null ? true : null,
      gstTotal,
      collectionMode: mode === 'payroll' ? 'salary' : mode === 'online' ? 'online' : d.paymentRequired === true ? 'online' : null,
      currency: text(d.currency, 8) || 'INR',
      paymentRequired: d.paymentRequired === true,
      policyNo: text(d.policyNo, 100),
    },
  };
}

/** One SmartCRM policy option (a flat-priced bundle) -> the app's option with a single slab. */
export function toAppOption(o) {
  const id = text(o?.id === undefined || o?.id === null ? '' : String(o.id), 100);
  if (!id) return null;
  return {
    id,
    name: text(o.name) || 'Add-on cover',
    type: 'single',
    slabs: [{ id: `${id}:flat`, familyStructure: null, baseSumInsured: null, premium: num(o.premium), gst: null, prorate: false }],
    // Options sharing a selection group are alternatives: the member may pick one of them.
    selectionGroup: text(o.selectionGroup, 100),
    participationThresholdPct: num(o.participationThresholdPct),
    benefits: (Array.isArray(o.benefits) ? o.benefits : []).slice(0, 30).map((b) => ({
      name: text(b?.name ?? b?.label) || null,
      limit: num(b?.limit ?? b?.sumInsured ?? b?.amount),
      note: text(b?.note ?? b?.description, 300),
    })),
  };
}

/** Session reply: adds the app-shaped policyOptions beside SmartCRM's own fields. */
export function withAppPolicyOptions(body) {
  const d = dataOf(body);
  if (!d || !Array.isArray(d.policy_options)) return body;
  return { ...body, data: { ...d, policyOptions: d.policy_options.slice(0, 50).map(toAppOption).filter(Boolean) } };
}

export default { selectedOptionIds, toSmartCrmQuote, fromSmartCrmQuote, toAppOption, withAppPolicyOptions };
