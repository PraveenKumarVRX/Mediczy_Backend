import express from 'express';

const buildDoctorAlerts = ({ pendingAppointments, todayAppointments }) => {
  const now = new Date().toISOString();
  const alerts = [];

  if (pendingAppointments > 0) {
    alerts.push({
      id: 'pending-appointments',
      type: 'warning',
      title: 'Pending Appointments',
      message: `You have ${pendingAppointments} appointment(s) awaiting confirmation`,
      timestamp: now,
      category: 'appointment',
      actionRequired: true,
    });
  }

  if (todayAppointments > 0) {
    alerts.push({
      id: 'today-appointments',
      type: 'info',
      title: "Today's Schedule",
      message: `You have ${todayAppointments} appointment(s) scheduled for today`,
      timestamp: now,
      category: 'appointment',
      actionRequired: false,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'no-alerts',
      type: 'success',
      title: 'All Clear',
      message: 'No urgent alerts at the moment',
      timestamp: now,
      category: 'system',
      actionRequired: false,
    });
  }

  return alerts;
};

export const createDoctorDashboardAlertsRouter = ({
  authDoctor,
  Appointment,
  Notification,
  Op,
  getCachedValue,
  setCachedValue,
  ALERT_STATE_PREFIX,
  ALERT_STATE_TTL,
  localAlertState,
}) => {
  const router = express.Router();

  router.get('/alerts', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;

      const pendingAppointments = await Appointment.count({
        where: { doctorId, status: 'pending' },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayAppointments = await Appointment.count({
        where: {
          doctorId,
          appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow },
        },
      });

      const baseAlerts = buildDoctorAlerts({ pendingAppointments, todayAppointments });
      const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
      const state = await getCachedValue(stateKey, localAlertState, {
        readIds: [],
        dismissedIds: [],
      });

      const dismissed = new Set(state.dismissedIds || []);
      const readIds = new Set(state.readIds || []);

      const aggregateAlerts = baseAlerts
        .filter((alert) => !dismissed.has(alert.id))
        .map((alert) => ({ ...alert, isRead: readIds.has(alert.id) }));

      const dbNotifications = await Notification.findAll({
        where: {
          userId: doctorId,
          userType: 'doctor',
          type: {
            [Op.in]: [
              'appointment_request',
              'appointment',
              'appointment_cancelled',
              'payment_received',
              'consultation_reminder',
              'consultation_starting',
            ],
          },
        },
        order: [['createdAt', 'DESC']],
        limit: 30,
      });

      const dbAlerts = dbNotifications
        .filter((n) => !dismissed.has(`notif-${n.id}`))
        .map((n) => ({
          id: `notif-${n.id}`,
          type: n.type === 'appointment_request' ? 'warning' : 'info',
          title: n.title,
          message: n.message,
          timestamp: n.createdAt.toISOString(),
          category: 'appointment',
          isRead: n.isRead || readIds.has(`notif-${n.id}`),
          actionRequired: n.type === 'appointment_request',
          data: n.data,
        }));

      const alerts = [...dbAlerts, ...aggregateAlerts];

      res.json({
        success: true,
        alerts,
        unreadCount: alerts.filter((alert) => !alert.isRead).length,
      });
    } catch (error) {
      console.error('Get alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alerts',
        error: error.message,
      });
    }
  });

  router.patch('/alerts/:alertId/read', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { alertId } = req.params;
      const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
      const state = await getCachedValue(stateKey, localAlertState, {
        readIds: [],
        dismissedIds: [],
      });

      if (!state.readIds.includes(alertId)) {
        state.readIds.push(alertId);
      }

      await setCachedValue(stateKey, state, ALERT_STATE_TTL, localAlertState);

      if (alertId.startsWith('notif-')) {
        const notifId = parseInt(alertId.replace('notif-', ''), 10);
        if (!Number.isNaN(notifId)) {
          await Notification.update(
            { isRead: true, readAt: new Date() },
            { where: { id: notifId, userId: doctorId } }
          );
        }
      }

      res.json({ success: true, message: 'Alert marked as read' });
    } catch (error) {
      console.error('Mark alert read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark alert as read',
        error: error.message,
      });
    }
  });

  router.patch('/alerts/mark-all-read', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [pendingAppointments, todayAppointments] = await Promise.all([
        Appointment.count({ where: { doctorId, status: 'pending' } }),
        Appointment.count({
          where: {
            doctorId,
            appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow },
          },
        }),
      ]);

      const baseAlerts = buildDoctorAlerts({ pendingAppointments, todayAppointments });
      const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
      const state = await getCachedValue(stateKey, localAlertState, {
        readIds: [],
        dismissedIds: [],
      });

      state.readIds = Array.from(new Set([...(state.readIds || []), ...baseAlerts.map((a) => a.id)]));
      await setCachedValue(stateKey, state, ALERT_STATE_TTL, localAlertState);

      await Notification.update(
        { isRead: true, readAt: new Date() },
        { where: { userId: doctorId, userType: 'doctor', isRead: false } }
      );

      res.json({ success: true, message: 'All alerts marked as read' });
    } catch (error) {
      console.error('Mark all alerts read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all alerts as read',
        error: error.message,
      });
    }
  });

  router.delete('/alerts/:alertId', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { alertId } = req.params;
      const stateKey = `${ALERT_STATE_PREFIX}${doctorId}`;
      const state = await getCachedValue(stateKey, localAlertState, {
        readIds: [],
        dismissedIds: [],
      });

      if (!state.dismissedIds.includes(alertId)) {
        state.dismissedIds.push(alertId);
      }

      await setCachedValue(stateKey, state, ALERT_STATE_TTL, localAlertState);

      if (alertId.startsWith('notif-')) {
        const notifId = parseInt(alertId.replace('notif-', ''), 10);
        if (!Number.isNaN(notifId)) {
          await Notification.destroy({ where: { id: notifId, userId: doctorId } });
        }
      }

      res.json({ success: true, message: 'Alert dismissed' });
    } catch (error) {
      console.error('Dismiss alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to dismiss alert',
        error: error.message,
      });
    }
  });

  router.get('/dashboard/stats', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;

      const totalPatients = await Appointment.count({
        where: { doctorId },
        distinct: true,
        col: 'userId',
      });

      const totalConsultations = await Appointment.count({
        where: { doctorId, status: 'completed' },
      });

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startOfLastMonth = new Date(startOfMonth);
      startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
      const endOfLastMonth = new Date(startOfMonth);
      endOfLastMonth.setDate(0);

      const lastMonthPatients = await Appointment.count({
        where: {
          doctorId,
          appointmentDate: { [Op.between]: [startOfLastMonth, endOfLastMonth] },
        },
        distinct: true,
        col: 'userId',
      });

      const lastMonthConsultations = await Appointment.count({
        where: {
          doctorId,
          status: 'completed',
          appointmentDate: { [Op.between]: [startOfLastMonth, endOfLastMonth] },
        },
      });

      const patientGrowth = lastMonthPatients > 0
        ? Math.round(((totalPatients - lastMonthPatients) / lastMonthPatients) * 100)
        : 0;
      const consultationGrowth = lastMonthConsultations > 0
        ? Math.round(((totalConsultations - lastMonthConsultations) / lastMonthConsultations) * 100)
        : 0;

      const totalRequests = await Appointment.count({ where: { doctorId } });
      const acceptedRequests = await Appointment.count({
        where: { doctorId, status: { [Op.ne]: 'cancelled' } },
      });
      const responseRate = totalRequests > 0 ? Math.round((acceptedRequests / totalRequests) * 100) : 95;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayAppointments = await Appointment.count({
        where: { doctorId, appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow } },
      });
      const pendingAppointments = await Appointment.count({
        where: { doctorId, status: 'pending' },
      });
      const completedToday = await Appointment.count({
        where: { doctorId, status: 'completed', appointmentDate: { [Op.gte]: today, [Op.lt]: tomorrow } },
      });

      const revenueResult = await Appointment.sum('paymentAmount', {
        where: { doctorId, status: 'completed', appointmentDate: { [Op.gte]: startOfMonth } },
      });
      const revenue = revenueResult || 0;

      res.json({
        success: true,
        totalPatients,
        totalConsultations,
        responseRate,
        patientGrowth,
        consultationGrowth,
        responseRateGrowth: 2,
        todayAppointments,
        pendingAppointments,
        completedToday,
        revenue,
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard stats',
        error: error.message,
      });
    }
  });

  return router;
};
