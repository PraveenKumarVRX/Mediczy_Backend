import cron from 'node-cron';
import { syncAllUsersStatus } from '../middleware/membership.middleware.js';
import { tick, tickError } from '../utils/cronRegistry.js';

/**
 * Cron job to sync user status with membership validity
 * Runs daily at 2:00 AM to check all users' membership status
 */
export const startMembershipSyncCron = () => {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Starting daily membership status sync...');
    
    try {
      const results = await syncAllUsersStatus();
      
      console.log('✅ Daily membership sync completed:');
      console.log(`   - Total users checked: ${results.total}`);
      console.log(`   - Activated (valid membership): ${results.activated}`);
      console.log(`   - Deactivated (no/expired membership): ${results.deactivated}`);
      tick('membership_sync', { total: results.total, activated: results.activated, deactivated: results.deactivated });
      console.log(`   - Unchanged: ${results.unchanged}`);
      
      if (results.errors.length > 0) {
        console.error(`   - Errors: ${results.errors.length}`);
        results.errors.forEach(err => {
          console.error(`     User ${err.userId}: ${err.error}`);
        });
      }
    } catch (error) {
      tickError('membership_sync', error.message);
      console.error('❌ Daily membership sync failed:', error);
    }
  });

  console.log('✅ Membership sync cron job scheduled (daily at 2:00 AM)');
};

/**
 * Cron job to send membership expiry notifications
 * Runs daily at 9:00 AM to notify users with expiring memberships
 */
export const startExpiryNotificationCron = () => {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('🕐 Starting membership expiry notifications...');
    
    try {
      const { UserPlan } = await import('../models/membershipPlan.model.intelligent.js');
      const { Op } = await import('sequelize');
      
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.date + 7);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Find all memberships expiring in the next 7 days
      const expiringPlans = await UserPlan.findAll({
        where: {
          status: 'active',
          endDate: {
            [Op.gte]: tomorrow.toISOString().split('T')[0],
            [Op.lte]: sevenDaysFromNow.toISOString().split('T')[0]
          }
        }
      });

      console.log(`📧 Found ${expiringPlans.length} memberships expiring in next 7 days`);

      // Send notifications
      const notificationService = await import('../services/notification.service.js');
      const userModel = await import('../models/user.model.intelligent.js');
      
      let notificationsSent = 0;
      
      for (const plan of expiringPlans) {
        try {
          const user = await userModel.default.findByPk(plan.userId);
          
          if (!user || !user.email) {
            continue;
          }

          const daysRemaining = Math.ceil(
            (new Date(plan.endDate) - new Date()) / (1000 * 60 * 60 * 24)
          );

          const subject = `Your Mediczy Membership Expires in ${daysRemaining} Day${daysRemaining > 1 ? 's' : ''}`;
          const message = `
Dear ${user.firstName},

Your Mediczy membership plan is expiring soon.

Plan Expiry Date: ${plan.endDate}
Days Remaining: ${daysRemaining}

To continue enjoying uninterrupted access to our services, please renew your membership before it expires.

${plan.autoRenew ? 'Note: Auto-renewal is enabled for your plan.' : 'Renew now to avoid service interruption.'}

Best regards,
Mediczy Team
          `.trim();

          await notificationService.default.sendEmail(user.email, subject, message);
          notificationsSent++;
          
          console.log(`✅ Expiry notification sent to user ${user.id} (${user.email}) - ${daysRemaining} days remaining`);
        } catch (error) {
          console.error(`Failed to send notification for plan ${plan.id}:`, error.message);
        }
      }

      console.log(`✅ Sent ${notificationsSent} membership expiry notifications`);
    } catch (error) {
      console.error('❌ Membership expiry notification job failed:', error);
    }
  });

  console.log('✅ Membership expiry notification cron job scheduled (daily at 9:00 AM)');
};

/**
 * Start all membership-related cron jobs
 */
export const startMembershipCronJobs = () => {
  startMembershipSyncCron();
  startExpiryNotificationCron();
  console.log('🚀 All membership cron jobs started');
};

export default startMembershipCronJobs;
