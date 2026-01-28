import { UserPlan } from '../models/membershipPlan.model.intelligent.js';
import { Op } from 'sequelize';

/**
 * Middleware to validate user has an active membership plan
 * Sets user status to inactive if no valid membership found
 */
export const validateMembership = async (req, res, next) => {
  // Skip membership check for non-user roles
  const exemptRoles = ['admin', 'super_admin', 'system_admin', 'platform_admin', 'doctor', 'nurse', 'assistant', 'corporate', 'lab'];
  
  if (exemptRoles.includes(req.userRole)) {
    return next();
  }

  // Skip for dev tokens
  if (req.guardrail === 'DEV_TOKEN') {
    return next();
  }

  // Allow read-only profile access without membership (for onboarding/account management)
  const isProfileRead = req.method === 'GET' && req.path === '/profile';
  if (isProfileRead) {
    return next();
  }

  // Allow core patient records/lab flows without membership gating.
  const membershipFreeBases = new Set([
    '/api/lab-tests',
    '/api/reports',
    '/api/labs',
    '/api/cart',
    '/api/wallet'
  ]);
  if (membershipFreeBases.has(req.baseUrl)) {
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
      // No active membership found - user should be inactive
      console.warn(`⚠️ User ${userId} has no active membership plan`);
      
      // Update user status to inactive if currently active
      if (req.user.status === 'active') {
        const userModel = await import('../models/user.model.intelligent.js');
        await userModel.default.update(
          { status: 'inactive' },
          { where: { id: userId } }
        );
        console.log(`❌ User ${userId} status set to inactive - no valid membership`);
      }

      return res.status(403).json({
        success: false,
        message: 'Access denied: No active membership plan found',
        errorCode: 'MEMBERSHIP_REQUIRED',
        details: {
          userId: userId,
          reason: 'No active membership plan',
          action: 'Please subscribe to a membership plan to continue using the app'
        }
      });
    }

    // Check if membership is expired
    const endDate = new Date(activePlan.endDate);
    const now = new Date();
    
    if (endDate < now) {
      console.warn(`⚠️ User ${userId} membership plan expired on ${activePlan.endDate}`);
      
      // Update plan status to expired
      await UserPlan.update(
        { status: 'expired' },
        { where: { id: activePlan.id } }
      );

      // Update user status to inactive
      const userModel = await import('../models/user.model.intelligent.js');
      await userModel.default.update(
        { status: 'inactive' },
        { where: { id: userId } }
      );

      return res.status(403).json({
        success: false,
        message: 'Access denied: Membership plan has expired',
        errorCode: 'MEMBERSHIP_EXPIRED',
        details: {
          userId: userId,
          planId: activePlan.membershipPlanId,
          expiredOn: activePlan.endDate,
          reason: 'Membership plan expired',
          action: 'Please renew your membership plan to continue'
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
      daysRemaining: Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
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
  const exemptRoles = ['admin', 'super_admin', 'system_admin', 'platform_admin', 'doctor', 'nurse', 'assistant', 'corporate', 'lab'];
  
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
    
    const activePlan = await UserPlan.findOne({
      where: {
        userId: userId,
        status: 'active',
        startDate: { [Op.lte]: currentDate },
        endDate: { [Op.gte]: currentDate }
      }
    });

    const userModel = await import('../models/user.model.intelligent.js');
    
    if (activePlan) {
      // Has valid membership - ensure active
      await userModel.default.update(
        { status: 'active' },
        { where: { id: userId } }
      );
      return { success: true, status: 'active', hasActivePlan: true };
    } else {
      // No valid membership - set inactive
      await userModel.default.update(
        { status: 'inactive' },
        { where: { id: userId } }
      );
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
    const allUsers = await userModel.default.findAll({
      where: {
        isAdmin: false,
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
