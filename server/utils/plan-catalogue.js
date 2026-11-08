/**
 * What a customer should see in a plan list.
 *
 * The plan tables hold working rows alongside sellable ones, and the mobile
 * app listed all of them: QA saw "Basic, Smart Basic, Basic Plan, Free Trial,
 * Basic Test Plan" — five ₹0 plans, one of them a test fixture — and
 * "Corporate Basic Plus" twice.
 *
 * This filters a *listing* only. Nothing is deactivated or deleted, so anyone
 * already subscribed to a hidden plan keeps it and every plan stays reachable
 * by id or slug. Admin listings pass the rows through untouched.
 */

/** Names that mark a row as a working fixture rather than something to sell. */
export const FIXTURE_NAME = /\b(test|demo|sample|dummy|placeholder|dev|qa)\b/i;

const value = (plan, key) => (plan && typeof plan.get === 'function' ? plan.get(key) : plan?.[key]);

const rank = (plan) => [
  Number(value(plan, 'tier') ?? Number.MAX_SAFE_INTEGER),
  Number(value(plan, 'price') ?? Number.MAX_SAFE_INTEGER),
  Number(value(plan, 'id') ?? Number.MAX_SAFE_INTEGER),
];

const compare = (a, b) => {
  const [ra, rb] = [rank(a), rank(b)];
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i];
  }
  return 0;
};

export const isFixturePlan = (plan) => FIXTURE_NAME.test(String(value(plan, 'name') || ''));

/**
 * Hide fixtures, then keep one plan per distinct offer.
 *
 * Two plans collide when they share a normalised name, or when both are free:
 * a catalogue cannot meaningfully sell five different ₹0 tiers, and a customer
 * reads them as duplicates. The survivor is the lowest tier, then the lowest
 * price, then the lowest id, so the choice is stable across requests.
 *
 * @param {object[]} plans  Sequelize instances or plain rows.
 * @returns {object[]} the same objects, filtered and ordered.
 */
export function publicPlanCatalogue(plans) {
  const sellable = (Array.isArray(plans) ? plans : []).filter((plan) => plan && !isFixturePlan(plan));

  const chosen = new Map();
  for (const plan of sellable) {
    // '+' is a tier marker, not punctuation: stripping it collapsed "Silver+"
    // (₹3,699) into "Silver" (₹1,499) and hid a real, more expensive plan.
    const name = String(value(plan, 'name') || '')
      .toLowerCase()
      .replace(/\+/g, 'plus')
      .replace(/[^a-z0-9]+/g, '');
    const isFree = Number(value(plan, 'price') ?? 0) === 0;
    // One bucket for every free plan, one per name for the rest.
    const key = isFree ? 'free' : `name:${name}`;
    const current = chosen.get(key);
    if (!current || compare(plan, current) < 0) chosen.set(key, plan);
  }

  return [...chosen.values()].sort(compare);
}

export default publicPlanCatalogue;
