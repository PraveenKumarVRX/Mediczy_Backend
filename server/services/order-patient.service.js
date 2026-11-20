/**
 * Who a medicine order is for: the signed-in member, or one of their own family members
 * (family_members is FORCED RLS, so the lookup runs in the member's context). Shared by
 * /api/pharmacy-orders and the cart's POST /api/billing/orders.
 */
import sharedPool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

/** The patient an order is for: the signed-in user, or one of their own family members. */
export async function resolveOrderPatient(user, rawFamilyMemberId) {
  const requested = String(rawFamilyMemberId ?? '').trim();
  if (requested) {
    if (!/^[1-9]\d{0,9}$/.test(requested)) return null;
    const member = await withRlsTransaction(sharedPool, { orgId: 0, userId: user.id }, async (client) => {
      const { rows } = await client.query(
        `SELECT id, "firstName", "lastName", relationship
           FROM family_members
          WHERE id = $1 AND "userId" = $2 AND "isActive" IS NOT FALSE`,
        [Number(requested), user.id],
      );
      return rows[0] || null;
    });
    if (!member) return null;
    return {
      type: 'family_member',
      family_member_id: member.id,
      name: [member.firstName, member.lastName].filter(Boolean).join(' ').trim() || null,
      relationship: member.relationship || null,
    };
  }
  const { rows } = await sharedPool.query('SELECT "firstName", "lastName" FROM users WHERE id = $1', [user.id]);
  return {
    type: 'self',
    family_member_id: null,
    name: [rows[0]?.firstName, rows[0]?.lastName].filter(Boolean).join(' ').trim() || null,
    relationship: 'self',
  };
}
