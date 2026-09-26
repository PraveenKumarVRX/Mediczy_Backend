/**
 * Regressions from the 2026-09-26 post-deploy log review:
 *  1. routes/fcm.route.js passed the *.intelligent.js WRAPPER object as `include.model` -> "include.model.getTableName is
 *     not a function" on every patient FCM registration with an active call.
 *  2. consultation-recording.route.js included Appointment, but the association was never declared -> every list/get 500'd.
 *  3. nurses / doctor_assistants lacked the "userId" column the declared associations select -> every nurse / assistant
 *     authentication logged "Primary model lookup failed" and worked only through the fallback model.
 */
import fs from 'fs';

let setupOnce;
const associate = () => (setupOnce ||= import('../models/userHierarchy.associations.js').then(({ default: setup }) => setup()));   // not idempotent: run once
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('includes use real Sequelize models', () => {
  it('fcm.route imports Doctor from the models index (a real model), not the intelligent wrapper', () => {
    const src = read('routes/fcm.route.js');
    expect(src).toMatch(/import \{ Doctor \} from '\.\.\/models\/index\.js'/);
    expect(src).not.toMatch(/doctor\.model\.intelligent\.js/);
  });

  it('consultation-recording includes the real Appointment model in every include (five)', () => {
    const src = read('routes/consultation-recording.route.js');
    expect(src.match(/model: AppointmentModel,/g)).toHaveLength(5);
    expect(src).not.toMatch(/model: Appointment,/);
    expect(src).not.toMatch(/'organizationId'\]/);            // not an Appointment attribute (it is organization_id)
  });

  it('the wrapper really is not a model, and the real ones are (why the above matters)', async () => {
    const wrapper = (await import('../models/doctor.model.intelligent.js')).default;
    const { Doctor, Appointment } = await import('../models/index.js');
    expect(typeof wrapper.getTableName).not.toBe('function');
    expect(typeof Doctor.getTableName).toBe('function');
    expect(typeof Appointment.getTableName).toBe('function');
  });

  it('ConsultationRecording is associated to Appointment as "appointment"', async () => {
    await associate();
    const { default: ConsultationRecording } = await import('../models/consultationRecording.model.intelligent.js');
    expect(ConsultationRecording.associations.appointment).toBeDefined();
    expect(ConsultationRecording.associations.appointment.foreignKey).toBe('appointmentId');
  });
});

describe('nurses / doctor_assistants userId', () => {
  it('the declared associations select "userId", and a migration adds it to both tables', async () => {
    await associate();
    const { default: Nurse } = await import('../models/postgres/nurse.model.postgres.js');
    const { default: DoctorAssistant } = await import('../models/postgres/doctor-assistant.model.postgres.js');
    expect(Object.keys(Nurse.rawAttributes)).toContain('userId');
    expect(Object.keys(DoctorAssistant.rawAttributes)).toContain('userId');
    const mig = await import('../migrations/20260926000007-nurse-assistant-userid.migration.js');
    expect(mig.TABLES).toEqual(['nurses', 'doctor_assistants']);
    const src = read('migrations/20260926000007-nurse-assistant-userid.migration.js');
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS "userId" INTEGER/);   // nullable (the link is optional) and idempotent
  });
});
