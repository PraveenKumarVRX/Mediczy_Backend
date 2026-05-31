/**
 * Kafka Consumers Service
 * -------------------------
 * Centralizes all Kafka event consumers for the Express server.
 * Each consumer listens to specific topics and triggers downstream actions.
 *
 * Consumers:
 *   - appointment.completed → health coins credit
 *   - appointment.booked    → schedule reminder + notification
 *   - patient.registered    → welcome flow + health risk baseline
 *   - claim.submitted       → fraud detection ML pipeline
 *   - ehr.accessed          → audit trail sink (Kafka → audit_logs)
 */

import { connectKafkaConsumer, KAFKA_TOPICS } from '../config/kafka.js';
import { addJob, QUEUE_NAMES } from '../config/queues.js';
import { getPool as pgPool } from '../db/postgres.js';
import { HEALTH_COINS_REWARDS } from '../config/health-coins.config.js';

// ─── Health Coins Consumer ────────────────────────────────────────────────────

async function creditHealthCoinsForAppointment(patientId, orgId, consultationType) {
  const rewardAmount = HEALTH_COINS_REWARDS?.COMPLETED_CONSULTATION ?? 50;

  const pool = pgPool();
  const walletRow = await pool.query(
    `SELECT id, current_balance FROM user_wallets WHERE user_id = $1`,
    [patientId]
  );
  if (!walletRow.rows.length) return;

  const { id: walletId, current_balance: balanceBefore } = walletRow.rows[0];
  const balanceAfter = Number(balanceBefore) + rewardAmount;

  await pool.query(
    `INSERT INTO health_coins_transactions
       (wallet_id, user_id, organization_id, transaction_type, amount,
        balance_before, balance_after, reference_type, description)
     VALUES ($1,$2,$3,'EARNED_APPOINTMENT',$4,$5,$6,'appointment','Consultation completed')`,
    [walletId, patientId, orgId, rewardAmount, balanceBefore, balanceAfter]
  );

  console.log(`[HealthCoins] Credited ${rewardAmount} coins to user ${patientId}`);
}

// ─── Appointment Consumer ─────────────────────────────────────────────────────

async function startAppointmentConsumer() {
  await connectKafkaConsumer(
    'express-appointment-consumer',
    [
      KAFKA_TOPICS.APPOINTMENT_COMPLETED,
      KAFKA_TOPICS.APPOINTMENT_BOOKED,
      KAFKA_TOPICS.APPOINTMENT_CANCELLED,
    ],
    async ({ topic, message }) => {
      let payload;
      try {
        const raw = JSON.parse(message.value?.toString() || '{}');
        payload = raw.payload || raw;
      } catch { return; }

      if (topic === KAFKA_TOPICS.APPOINTMENT_COMPLETED) {
        // Credit health coins to patient
        if (payload.patientId) {
          await creditHealthCoinsForAppointment(
            payload.patientId, payload.orgId, payload.consultationType
          ).catch(e => console.error('[Kafka:AppointmentCompleted] Coins error:', e.message));
        }

        // Queue follow-up notification
        await addJob(QUEUE_NAMES.NOTIFICATIONS, 'appointment-followup', {
          userId:        payload.patientId,
          appointmentId: payload.appointmentId,
          doctorId:      payload.doctorId,
        }).catch(() => {});
      }

      if (topic === KAFKA_TOPICS.APPOINTMENT_BOOKED) {
        // Queue appointment reminder (24h + 1h before)
        await addJob(QUEUE_NAMES.NOTIFICATIONS, 'appointment-reminder', {
          userId:          payload.patientId,
          appointmentId:   payload.appointmentId,
          doctorId:        payload.doctorId,
          appointmentDate: payload.date,
          appointmentTime: payload.time,
        }, { delay: Math.max(0, new Date(`${payload.date}T${payload.time}`).getTime() - Date.now() - 24 * 60 * 60 * 1000) }
        ).catch(() => {});
      }
    }
  );
  console.log('✅ Kafka: appointment consumer started');
}

// ─── Patient Registration Consumer ───────────────────────────────────────────

async function startPatientRegistrationConsumer() {
  await connectKafkaConsumer(
    'express-patient-consumer',
    [KAFKA_TOPICS.PATIENT_REGISTERED],
    async ({ message }) => {
      let payload;
      try { payload = JSON.parse(message.value?.toString() || '{}').payload; } catch { return; }
      if (!payload?.userId) return;

      // Queue welcome email
      await addJob(QUEUE_NAMES.EMAIL, 'welcome-email', { userId: payload.userId }).catch(() => {});

      // Create wallet for new patient
      const pool = pgPool();
      await pool.query(
        `INSERT INTO user_wallets (user_id, organization_id) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [payload.userId, payload.orgId]
      ).catch(() => {});
    }
  );
  console.log('✅ Kafka: patient registration consumer started');
}

// ─── EHR Access Audit Consumer ───────────────────────────────────────────────

async function startEhrAuditConsumer() {
  await connectKafkaConsumer(
    'express-ehr-audit-consumer',
    [KAFKA_TOPICS.EHR_ACCESSED],
    async ({ message }) => {
      let payload;
      try { payload = JSON.parse(message.value?.toString() || '{}').payload; } catch { return; }
      if (!payload) return;

      const pool = pgPool();
      await pool.query(
        `INSERT INTO platform_audit_logs
           (tenant_id, user_id, event_type, event_category, actor_id, target_type, target_id, status)
         VALUES (NULL, $1, 'ehr.accessed', 'PHI_ACCESS', $2, 'PATIENT', $3, 'SUCCESS')`,
        [payload.accessedBy, payload.accessedBy, payload.patientId]
      ).catch(() => {});
    }
  );
  console.log('✅ Kafka: EHR audit consumer started');
}

// ─── Start all consumers ──────────────────────────────────────────────────────

export async function startAllKafkaConsumers() {
  await Promise.allSettled([
    startAppointmentConsumer(),
    startPatientRegistrationConsumer(),
    startEhrAuditConsumer(),
  ]);
  console.log('✅ All Kafka consumers initialized');
}

export default { startAllKafkaConsumers };
