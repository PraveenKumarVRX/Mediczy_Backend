import cron from 'node-cron';
import { syncAllUsersStatus } from '../middleware/membership.middleware.js';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';
import n8nService from './n8n.service.js';
import whatsappProductionService from './whatsapp-production.service.js';

const formatMembershipDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().split('T')[0];
};

const computeDaysRemaining = (endDate) => {
  const now = new Date();
  const endOfDay = new Date(`${formatMembershipDate(endDate)}T23:59:59.999Z`);
  return Math.max(0, Math.ceil((endOfDay - now) / (1000 * 60 * 60 * 24)));
};

const buildReminderMessage = ({ userName, planName, endDate, daysRemaining, autoRenew, renewalUrl }) => {
  return `Dear ${userName},

Your SmartHealth membership plan is expiring soon.

Plan: ${planName}
Plan Expiry Date: ${formatMembershipDate(endDate)}
Days Remaining: ${daysRemaining}

To continue enjoying uninterrupted access to our services, please renew your membership before it expires.

${autoRenew ? 'Note: Auto-renewal is enabled for your plan.' : 'Renew now to avoid service interruption.'}
${renewalUrl ? `\nRenewal Link: ${renewalUrl}` : ''}

Best regards,
Team SmartHealth`;
};

export const sendMembershipExpiryReminders = async ({
  userId = null,
  daysAhead = 7,
  includeExpiredToday = false,
  renewalUrl = null
} = {}) => {
  const { UserPlan, MembershipPlan } = await import('../models/postgres/membershipPlan.model.postgres.js');
  const { Op } = await import('sequelize');
  const notificationService = (await import('../services/notification.service.js')).default;
  const userModel = (await import('../models/user.model.intelligent.js')).default;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const toDate = new Date();
  toDate.setDate(toDate.getDate() + Math.max(1, Number(daysAhead) || 7));
  const toDateStr = toDate.toISOString().split('T')[0];

  const endDateRange = {
    [Op.gte]: includeExpiredToday ? todayStr : new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    [Op.lte]: toDateStr
  };

  const where = {
    status: 'active',
    endDate: endDateRange
  };

  if (userId) {
    where.userId = userId;
    if (includeExpiredToday) {
      where.status = { [Op.in]: ['active', 'expired'] };
    }
  }

  const expiringPlans = await UserPlan.findAll({
    where,
    include: [{ model: MembershipPlan, as: 'plan', required: false }],
    order: [['endDate', 'ASC']]
  });

  let notificationsSent = 0;
  const results = [];

  for (const plan of expiringPlans) {
    try {
      const user = await userModel.findByPk(plan.userId);
      if (!user) {
        results.push({ userId: plan.userId, sent: false, reason: 'user_not_found' });
        continue;
      }

      const daysRemaining = computeDaysRemaining(plan.endDate);
      const planName = plan.plan?.name || plan.metadata?.planName || `Plan #${plan.membershipPlanId}`;
      const link = renewalUrl || `${process.env.FRONTEND_URL || 'https://app.mediqzy.com'}/membership`;

      const subject = `Your SmartHealth Membership Expires in ${daysRemaining} Day${daysRemaining > 1 ? 's' : ''}`;
      const message = buildReminderMessage({
        userName: user.firstName || 'Member',
        planName,
        endDate: plan.endDate,
        daysRemaining,
        autoRenew: !!plan.autoRenew,
        renewalUrl: link
      });

      const emailResult = await notificationService.sendEmail(
        user.id,
        'user',
        subject,
        message,
        'membership_expiring',
        {
          planName,
          endDate: formatMembershipDate(plan.endDate),
          daysRemaining,
          renewalUrl: link
        }
      );

      // Use dedicated renewal-reminder template (with Renew Now button) if phone available
      let whatsappResult = { success: false };
      try {
        const phone = user.phoneNumber || user.phone;
        if (phone) {
          let formattedPhone = String(phone).replace(/[^0-9+]/g, '');
          if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;
          await whatsappProductionService.sendMembershipRenewalReminder({
            to: formattedPhone,
            name: user.firstName || 'Member',
            planName,
            expiryDate: formatMembershipDate(plan.endDate),
            daysRemaining,
            renewalUrl: link
          });
          whatsappResult = { success: true };
        }
      } catch (waErr) {
        console.error(`WhatsApp renewal reminder failed for user ${user.id}:`, waErr.message);
        whatsappResult = { success: false, error: waErr.message };
      }

      n8nService.trigger('membership-expiry', {
        userId: user.id,
        userEmail: user.email,
        userName: user.firstName,
        planId: plan.id,
        planName,
        expiryDate: plan.endDate,
        daysRemaining,
        autoRenew: plan.autoRenew,
        renewalUrl: link
      }).catch(() => {});

      if (emailResult?.success || whatsappResult?.success) {
        notificationsSent++;
      }

      results.push({
        userId: user.id,
        email: !!emailResult?.success,
        whatsapp: !!whatsappResult?.success,
        daysRemaining,
        renewalUrl: link
      });

      console.log(`✅ Membership reminder processed for user ${user.id} (${user.email || 'no-email'})`);
    } catch (error) {
      console.error(`Failed to process membership reminder for plan ${plan.id}:`, error.message);
      results.push({ userId: plan.userId, sent: false, error: error.message });
    }
  }

  return {
    total: expiringPlans.length,
    notificationsSent,
    results
  };
};

/**
 * Cron job to sync user status with membership validity
 * Runs daily at 2:00 AM to check all users' membership status
 */
export const startMembershipSyncCron = () => {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    if (!(await beginJob('membership_sync'))) return;
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
      const result = await sendMembershipExpiryReminders({ daysAhead: 7, includeExpiredToday: false });
      console.log(`✅ Sent ${result.notificationsSent} membership expiry notifications (processed ${result.total})`);
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
