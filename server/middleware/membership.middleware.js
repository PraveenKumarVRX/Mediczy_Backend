import { UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import { Op } from 'sequelize';
import { auditAccountStatusTransition } from './audit.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const MEMBERSHIP_RENEWAL_EXEMPT_EMAILS = new Set(
  String(process.env.MEMBERSHIP_RENEWAL_EXEMPT_EMAILS || 'user@mediczy.com')
    .split(',')
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
);

const isMembershipRenewalExemptUser = (user) => {
  const email = String(user?.email || '').trim().toLowerCase();
  if (MEMBERSHIP_RENEWAL_EXEMPT_EMAILS.has(email)) return true;

  // Managed service accounts are not customers and never hold a membership, so
  // the nightly sync in syncAllUsersStatus() flipped them to 'inactive' — and
  // because patient login requires status='active', the account simply stopped
  // working. That is how the app-store reviewer login died overnight, which
  // would have been read by the store as 'we could not access the app'.
  // Same flags the erasure guard uses (routes/data-export.route.js).
  const metadata = user?.metadata || {};
  return metadata.doNotDelete === true || metadata.purpose === 'app-store-review';
};

// A corporate employee's care is funded by the employer's active corporate
// relationship, not by an individual Mediczy membership.
//
// The authoritative signal is the employee association in user_associations:
// role='employee' + status='active' against an active corporate. An earlier
// version ALSO required a matching corporate_employees row, on the reasoning
// that a stale association should not bypass the individual membership policy.
// That inner join turned out to deny 3,858 real employees, because
// corporate_employees is the HR roster and is populated inconsistently --
// Equitas Bank Ltd had 3,840 active employee associations and ZERO roster
// rows, so its entire workforce failed this check and the nightly sync then
// flipped 3,839 of them to 'inactive', locking them out of login outright.
//
// So the roster is now consulted only to EXCLUDE: if HR has explicitly marked
// the employee inactive on the roster, they are not sponsored. A corporate
// whose roster was never imported no longer loses access, while an
// HR-deactivated employee is still denied, which was the original intent.
// An exited employee's association is itself set non-active, which this
// already gates on.
const activeCorporateEmployee = async (userId) => {
  if (!userId) return false;
  const [row] = await postgresSequelize.query(
    `SELECT 1
       FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
       LEFT JOIN corporate_employees ce ON ce."userId" = ua."userId"
          AND ce.corporate_id = ua."entityId"
      WHERE ua."userId" = :userId
        AND ua."entityType" = 'corporate'
        AND ua.role = 'employee'
        AND ua.status = 'active'
        AND COALESCE(ce."isActive", true) = true
      LIMIT 1`,
    { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  return Boolean(row);
};

// Minimal-gating policy (2026-11-07): patient flows are OPEN by default. Only this
// explicit, short list of premium features requires an active membership plan;
// everything else — including ALL read-only APIs (pharmacy list, prescriptions,
// reports, etc.) — is ungated. Add a premium feature by its method + full path.
const MEMBERSHIP_REQUIRED_FEATURES = [
  { method: 'POST', path: '/api/family-members' },   // Add patient (family member / dependent)
  // Pharmacy orders are open to everyone at list price (owner decision 2026-11-20, plan
  // lineup report); members get the member discount (isPaidMember).
];

// Full request path, independent of where in the stack the gate runs.
const normalizedFullPath = (req) => {
  const base = req.baseUrl || '';
  const sub = !req.path || req.path === '/' ? '' : req.path.replace(/\/+$/, '');
  return (base + sub) || '/';
};

const requiresMembership = (req) =>
  MEMBERSHIP_REQUIRED_FEATURES.some(
    (rule) => rule.method === req.method && normalizedFullPath(req) === rule.path
  );

/**
 * Paid access (owner decision 2026-11-20): an individual member uses the app only with a plan,
 * bought (lowest ₹99 Basic) or granted by a promo coupon. Until then the account is inactive and
 * reaches only what it takes to choose, pay for or redeem a plan and to manage the account.
 * users.status is the fast path: the nightly sync keeps it, and subscribe/redeem set it at once.
 */
export const PRE_PLAN_PATHS = [
  '/api/membership/plans',
  '/api/membership/my',
  '/api/membership/upgrade-options',
  '/api/membership/addons',
  '/api/membership/payment-order',
  '/api/membership/subscribe',
  '/api/membership/validate-free-coupon',
  '/api/membership/redeem-free-coupon',
  // Paid but the app never finished activation: "Already have a plan? Check again".
  '/api/membership/reconcile',
  '/api/membership-plans/plans',
  '/api/membership-plans/subscription',
  '/api/users/profile',
  '/api/users/change-password',
  '/api/users/account',
  '/api/privacy',
  '/api/consent',
  '/api/fcm',
  '/api/auth',
  '/api/notifications',
  // Buying lab tests and medicines at list price needs no plan (owner decision 2026-11-20):
  // it is revenue, and it is how members are won. Member prices apply only to members.
  '/api/labs',
  '/api/lab-tests',
  '/api/health-checkups',
  '/api/cart',
  '/api/pharmacy',
  '/api/pharmacy-orders',
  '/api/billing/orders',
  '/api/billing/payments',
  '/api/payments',
  '/api/addresses',
  '/api/masterdata',
  '/api/prescriptions',
];

/**
 * A member who paid and is still locked must be able to ask for help: raise a support ticket and
 * read their own tickets and replies (stuck-payment incident 2026-11-22). Only these, by method,
 * not the staff ticket tools under the same prefix.
 */
export const PRE_PLAN_ROUTES = [
  { method: 'GET', pattern: /^\/api\/tickets$/ },
  { method: 'POST', pattern: /^\/api\/tickets$/ },
  { method: 'GET', pattern: /^\/api\/tickets\/(?!stats$|agents$|export\/)[A-Za-z0-9_-]{1,64}$/ },
  { method: 'POST', pattern: /^\/api\/tickets\/[A-Za-z0-9_-]{1,64}\/messages$/ },
];

export const isPrePlanPath = (path, method = 'GET') =>
  PRE_PLAN_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))
  || PRE_PLAN_ROUTES.some((r) => r.method === String(method).toUpperCase() && r.pattern.test(path));

/**
 * A locked member who has a paid plan order we never activated: finish it now (the app lost the
 * checkout reply). The app opens gated screens straight after every sign-in, whichever way the member
 * signed in, so this is the self-heal at sign-in. Bounded: no orders means one indexed query, and
 * Razorpay is asked about an order at most every 20 seconds, for at most 4 seconds here.
 */
const reconcileOnTheWayIn = async (userId) => {
  try {
    const { reconcileUserPlanOrders } = await import('../services/plan-activation.service.js');
    const result = await Promise.race([
      reconcileUserPlanOrders(userId, { via: 'reconcile' }),
      new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    return Boolean(result?.activated?.length);
  } catch (error) {
    console.error(`[membership] sign-in reconcile for user ${userId} failed: ${error.message}`);
    return false;
  }
};

/** True when the member may use the app: exempt test account, funded employee or a current plan. */
const hasPaidAccess = async (user) => {
  if (isMembershipRenewalExemptUser(user)) return true;
  if (await activeCorporateEmployee(user.id)) return true;
  const today = new Date().toISOString().split('T')[0];
  const plan = await UserPlan.findOne({
    where: { userId: user.id, status: 'active', startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } },
    attributes: ['id'],
  });
  return Boolean(plan);
};

/**
 * Member pricing: true when the person holds a current plan, is a funded corporate employee or is
 * an exempt test account. Non-members still buy lab tests and medicines, at list price.
 */
export const isPaidMember = async (userId) => {
  if (!userId) return false;
  try {
    const [user] = await postgresSequelize.query(
      'SELECT id, email, metadata FROM users WHERE id = :userId LIMIT 1',
      { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT });
    return user ? await hasPaidAccess(user) : false;
  } catch (error) {
    console.error('[membership] member pricing check failed:', error.message);
    return false; // list price, never a free discount by accident
  }
};

export const MEMBERSHIP_REQUIRED_BODY = {
  success: false,
  code: 'MEMBERSHIP_REQUIRED',
  errorCode: 'MEMBERSHIP_REQUIRED',
  message: 'Choose a plan or enter a promo code to start using My SmartHealth.',
  details: { nextStep: 'choose_plan', reason: 'No active membership plan' },
};

/**
 * Membership/entitlement gate — minimal-gating model: allow by default; require an
 * active plan only for MEMBERSHIP_REQUIRED_FEATURES. It never deactivates the
 * account (account status is owned by syncUserStatusWithMembership), and returns a
 * user-facing, CTA-friendly message rather than a raw "Access denied".
 */
export const validateMembership = async (req, res, next) => {
  // Skip membership check for non-user roles
  const exemptRoles = ['admin', 'super_admin', 'system_admin', 'platform_admin', 'doctor', 'nurse', 'assistant', 'corporate', 'lab', 'team'];

  if (exemptRoles.includes(req.userRole)) {
    return next();
  }

  // Skip for dev tokens
  if (req.guardrail === 'DEV_TOKEN') {
    return next();
  }

  // Paid access: an inactive individual member reaches only the pre-plan paths. An account
  // that has a plan but was not yet marked active (paid on the web, nightly sync not run) is
  // set active here instead of being refused.
  if ((req.userRole === 'user' || req.userRole === 'patient') && req.user?.id && req.user.status !== 'active' && !isPrePlanPath(normalizedFullPath(req), req.method)) {
    // Deleted (erased) or suspended accounts are never re-activated from here.
    if (req.user.status && req.user.status !== 'inactive') {
      return res.status(403).json({ success: false, code: 'ACCOUNT_INACTIVE', message: 'This account is not active. Please contact support.' });
    }
    try {
      if (!(await hasPaidAccess(req.user)) && !(await reconcileOnTheWayIn(req.user.id))) return res.status(403).json(MEMBERSHIP_REQUIRED_BODY);
      await syncUserStatusWithMembership(req.user.id);
      req.user.status = 'active';
    } catch (error) {
      console.error('[membership] paid-access check failed:', error.message);
      return res.status(503).json({ success: false, message: 'Could not check your membership. Please try again.' });
    }
  }

  // Minimal gating: everything except the explicit premium feature list is open,
  // including every read-only API. This is the fix for BUG-01/05/06 + W-PLAN-2.
  if (!requiresMembership(req)) {
    return next();
  }

  // This IS a plan-gated premium feature. Corporate employees' premium access is
  // funded by their employer relationship, not a personal membership.
  if (req.userRole === 'user' && await activeCorporateEmployee(req.user?.id)) {
    req.userCorporateSponsored = true;
    return next();
  }

  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
    }

    // Testing account exception: never expire due to membership renewal policy.
    if (isMembershipRenewalExemptUser(req.user)) {
      if (req.user.status !== 'active') {
        const userModel = await import('../models/user.model.intelligent.js');
        await userModel.default.update(
          { status: 'active' },
          { where: { id: userId } }
        );
        await auditAccountStatusTransition(req, {
          userId,
          userEmail: req.user?.email,
          fromStatus: req.user?.status || 'unknown',
          toStatus: 'active',
          reasonCode: 'RENEWAL_EXEMPT_TEST_USER',
          reason: 'Membership renewal exemption for testing account',
          source: 'validateMembership',
        });
        req.user.status = 'active';
      }

      req.userMembership = {
        planId: null,
        status: 'active',
        startDate: null,
        endDate: null,
        autoRenew: true,
        daysRemaining: Number.MAX_SAFE_INTEGER,
        renewalExempt: true,
      };
      return next();
    }

    // Find active membership plan for user
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const activePlan = await UserPlan.findOne({
      where: {
        userId: userId,
        status: 'active',
        startDate: { [Op.lte]: currentDate },
        endDate: { [Op.gte]: currentDate }
      }
    });

    if (!activePlan) {
      // Premium feature attempted without an active plan. Do NOT deactivate the
      // account — the user is valid, just not a member. Return a friendly CTA.
      console.warn(`⚠️ User ${userId} attempted a plan-gated feature (${normalizedFullPath(req)}) with no active plan`);
      return res.status(403).json({
        success: false,
        message: 'Please activate a plan to use this feature.',
        errorCode: 'MEMBERSHIP_REQUIRED',
        details: {
          feature: normalizedFullPath(req),
          reason: 'No active membership plan',
          action: 'Activate a membership plan to continue'
        }
      });
    }

    // Treat endDate as inclusive through the end of that day.
    // Otherwise plans get marked expired right after midnight on the end date.
    const endOfDay = new Date(activePlan.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    const now = new Date();
    
    if (endOfDay < now) {
      console.warn(`⚠️ User ${userId} membership plan expired on ${activePlan.endDate}`);

      // Mark the plan expired (data hygiene). Do NOT deactivate the account here —
      // account status is owned by syncUserStatusWithMembership.
      await UserPlan.update(
        { status: 'expired' },
        { where: { id: activePlan.id } }
      );

      return res.status(403).json({
        success: false,
        message: 'Your membership plan has expired. Please renew to use this feature.',
        errorCode: 'MEMBERSHIP_EXPIRED',
        details: {
          feature: normalizedFullPath(req),
          planId: activePlan.membershipPlanId,
          expiredOn: activePlan.endDate,
          reason: 'Membership plan expired',
          action: 'Renew your membership plan to continue'
        }
      });
    }

    // Valid membership found - ensure user status is active
    if (req.user.status !== 'active') {
      const userModel = await import('../models/user.model.intelligent.js');
      await userModel.default.update(
        { status: 'active' },
        { where: { id: userId } }
      );
      await auditAccountStatusTransition(req, {
        userId,
        userEmail: req.user?.email,
        fromStatus: req.user.status,
        toStatus: 'active',
        reasonCode: 'VALID_MEMBERSHIP',
        reason: 'Valid membership found',
        source: 'validateMembership',
        extra: {
          planId: activePlan.membershipPlanId,
          endDate: activePlan.endDate,
        },
      });
      console.log(`✅ User ${userId} status restored to active - valid membership found`);
      req.user.status = 'active';
    }

    // Attach membership info to request for later use
    req.userMembership = {
      planId: activePlan.membershipPlanId,
      status: activePlan.status,
      startDate: activePlan.startDate,
      endDate: activePlan.endDate,
      autoRenew: activePlan.autoRenew,
      daysRemaining: Math.ceil((endOfDay - now) / (1000 * 60 * 60 * 24))
    };

    console.log(`✅ User ${userId} has valid membership - Plan ID: ${activePlan.membershipPlanId}, Days remaining: ${req.userMembership.daysRemaining}`);

    next();
  } catch (error) {
    console.error('❌ Membership validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate membership',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware to check if user's membership is expiring soon (within 7 days)
 * Adds warning to response but doesn't block access
 */
export const checkMembershipExpiry = async (req, res, next) => {
  // Skip for non-user roles
  const exemptRoles = ['admin', 'super_admin', 'system_admin', 'platform_admin', 'doctor', 'nurse', 'assistant', 'corporate', 'lab', 'team'];
  
  if (exemptRoles.includes(req.userRole)) {
    return next();
  }

  try {
    const userId = req.user?.id;
    
    if (!userId || !req.userMembership) {
      return next();
    }

    const { daysRemaining } = req.userMembership;

    // Add warning if expiring within 7 days
    if (daysRemaining <= 7 && daysRemaining > 0) {
      req.membershipWarning = {
        type: 'expiring_soon',
        message: `Your membership will expire in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`,
        daysRemaining: daysRemaining,
        action: 'Please renew your membership to avoid service interruption'
      };
    }

    next();
  } catch (error) {
    console.error('Membership expiry check error:', error);
    // Don't block request on error
    next();
  }
};

/**
 * Helper function to manually validate and update user status based on membership
 * Can be called from cron jobs or admin actions
 */
export const syncUserStatusWithMembership = async (userId) => {
  try {
    const currentDate = new Date().toISOString().split('T')[0];
    const userModel = await import('../models/user.model.intelligent.js');
    const currentUser = await userModel.default.findOne({
      where: { id: userId },
      attributes: ['status', 'email', 'metadata']
    });

    if (isMembershipRenewalExemptUser(currentUser)) {
      if (currentUser?.status !== 'active') {
        await userModel.default.update(
          { status: 'active' },
          { where: { id: userId } }
        );
        await auditAccountStatusTransition(
          {
            user: { id: userId, role: 'system', email: currentUser?.email || null },
            ip: 'system',
            headers: {},
            method: 'SYSTEM',
            originalUrl: '/system/membership-sync',
          },
          {
            userId,
            userEmail: currentUser?.email || null,
            fromStatus: currentUser?.status || 'unknown',
            toStatus: 'active',
            reasonCode: 'RENEWAL_EXEMPT_TEST_USER',
            reason: 'Membership renewal exemption for testing account',
            source: 'syncUserStatusWithMembership',
          }
        );
      }
      return { success: true, status: 'active', hasActivePlan: true, renewalExempt: true };
    }
    
    const activePlan = await UserPlan.findOne({
      where: {
        userId: userId,
        status: 'active',
        startDate: { [Op.lte]: currentDate },
        endDate: { [Op.gte]: currentDate }
      }
    });

    // A corporate employee's membership is their employer's corporate plan, not
    // an individual UserPlan. validateMembership() has always understood this
    // ('funded by the employer's active corporate relationship'), but this sync
    // looked only at user_plans — so 864 funded employees were flipped to
    // 'inactive' overnight and could no longer log in at all, because patient
    // login requires status='active'. Same authoritative test as the middleware:
    // an active association AND an active roster row AND an active corporate.
    const corporateFunded = activePlan ? false : await activeCorporateEmployee(userId);

    if (activePlan || corporateFunded) {
      // Has valid membership - ensure active
      const previousStatus = await userModel.default.findOne({
        where: { id: userId },
        attributes: ['status', 'email', 'metadata']
      });
      await userModel.default.update(
        { status: 'active' },
        { where: { id: userId } }
      );
      if (previousStatus?.status !== 'active') {
        await auditAccountStatusTransition(
          {
            user: { id: userId, role: 'system', email: previousStatus?.email || null },
            ip: 'system',
            headers: {},
            method: 'SYSTEM',
            originalUrl: '/system/membership-sync',
          },
          {
            userId,
            userEmail: previousStatus?.email || null,
            fromStatus: previousStatus?.status || 'unknown',
            toStatus: 'active',
            reasonCode: corporateFunded ? 'CORPORATE_PLAN' : 'VALID_MEMBERSHIP',
            reason: corporateFunded
              ? 'Membership sync marked user active: funded by employer corporate plan'
              : 'Membership sync marked user active',
            source: 'syncUserStatusWithMembership',
          }
        );
      }
      return { success: true, status: 'active', hasActivePlan: true, corporateFunded };
    } else {
      // No valid membership - set inactive
      const previousStatus = await userModel.default.findOne({
        where: { id: userId },
        attributes: ['status', 'email', 'metadata']
      });
      await userModel.default.update(
        { status: 'inactive' },
        { where: { id: userId } }
      );
      if (previousStatus?.status !== 'inactive') {
        await auditAccountStatusTransition(
          {
            user: { id: userId, role: 'system', email: previousStatus?.email || null },
            ip: 'system',
            headers: {},
            method: 'SYSTEM',
            originalUrl: '/system/membership-sync',
          },
          {
            userId,
            userEmail: previousStatus?.email || null,
            fromStatus: previousStatus?.status || 'unknown',
            toStatus: 'inactive',
            reasonCode: 'NO_ACTIVE_MEMBERSHIP',
            reason: 'Membership sync marked user inactive',
            source: 'syncUserStatusWithMembership',
          }
        );
      }
      return { success: true, status: 'inactive', hasActivePlan: false };
    }
  } catch (error) {
    console.error(`Failed to sync user ${userId} status:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Batch sync all users' status based on their membership
 * For use in cron jobs or admin maintenance
 */
export const syncAllUsersStatus = async () => {
  try {
    const userModel = await import('../models/user.model.intelligent.js');
    // Only sync consumer users — team/doctor/corporate/admin roles manage
    // their own access and do not require a UserPlan membership
    const allUsers = await userModel.default.findAll({
      where: {
        isAdmin: false,
        isTeam: false,
        role: { [Op.in]: ['user', 'patient'] },
        status: { [Op.in]: ['active', 'inactive'] }
      },
      attributes: ['id', 'email', 'status']
    });

    const results = {
      total: allUsers.length,
      activated: 0,
      deactivated: 0,
      unchanged: 0,
      errors: []
    };

    for (const user of allUsers) {
      const result = await syncUserStatusWithMembership(user.id);
      
      if (result.success) {
        if (result.status === 'active' && user.status !== 'active') {
          results.activated++;
        } else if (result.status === 'inactive' && user.status === 'active') {
          results.deactivated++;
        } else {
          results.unchanged++;
        }
      } else {
        results.errors.push({ userId: user.id, error: result.error });
      }
    }

    console.log('📊 User status sync completed:', results);
    return results;
  } catch (error) {
    console.error('Batch user status sync failed:', error);
    throw error;
  }
};

export default validateMembership;
