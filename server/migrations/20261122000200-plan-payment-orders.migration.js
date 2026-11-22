/**
 * Every Razorpay order made for a membership plan, so a payment that never activated its plan can be
 * found and finished without searching Razorpay (stuck-payment incident 2026-11-22: a member paid
 * ₹99 for Start by UPI, the app never called /subscribe, and nothing on our side knew the order
 * existed).
 *
 *   status 'created'    order made by /membership/payment-order, not yet activated
 *          'activated'  a user_plans row holds its payment (user_plan_id)
 *          'refused'    paid, but activating would break a plan rule (refusal_code); needs a person
 *                       (refund or manual decision), never retried automatically
 *
 * activated_via: subscribe | upgrade (the app's own call), webhook, reconcile (sign-in or the
 * member's "check again"), admin (activated from a verified payment id).
 *
 * Also makes user_plans."paymentId" unique where set, so the app's /subscribe, the webhook and the
 * reconcile can race on one payment and only one of them creates a plan.
 *
 * Not row-level secured: no clinical data, only order ids, amounts and states, read and written
 * only by the membership routes and the payment webhook.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261122000200-plan-payment-orders.migration.js
 */
export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS plan_payment_orders (
      id                   bigserial PRIMARY KEY,
      user_id              integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_uid             varchar(6),
      plan_id              integer NOT NULL,
      kind                 text NOT NULL,
      razorpay_order_id    varchar(64) NOT NULL UNIQUE,
      amount_paise         integer NOT NULL,
      coupon_code          varchar(64),
      status               text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'activated', 'refused')),
      razorpay_payment_id  varchar(64),
      user_plan_id         integer REFERENCES user_plans(id) ON DELETE SET NULL,
      activated_via        text,
      refusal_code         varchar(64),
      last_checked_at      timestamptz,
      activated_at         timestamptz,
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS plan_payment_orders_user_open
    ON plan_payment_orders (user_id, status, created_at DESC)`);

  // One payment activates one plan, whichever path gets there first.
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS user_plans_payment_id_unique
    ON user_plans ("paymentId") WHERE "paymentId" IS NOT NULL`);

  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') THEN
        PERFORM attach_uid_reference('plan_payment_orders', 'user_id', 'user_uid', 'users');
      END IF;
    END
    $$;`);
}

export async function down(client) {
  await client.query('DROP INDEX IF EXISTS user_plans_payment_id_unique');
  await client.query('DROP TABLE IF EXISTS plan_payment_orders');
}
