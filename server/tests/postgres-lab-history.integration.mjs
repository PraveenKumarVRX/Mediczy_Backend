import assert from 'node:assert/strict';

// This test creates schema objects and must ONLY target its disposable cluster.
// Check before importing configuration or opening any database connection.
if (process.env.POSTGRES_PRIMARY_DATABASE !== 'lab_history_test' ||
    !process.env.POSTGRES_PRIMARY_HOST?.startsWith('/tmp/msh-lab-pg-') ||
    process.env.POSTGRES_PRIMARY_USER !== 'lab_history_app') {
  throw new Error('Use a disposable lab_history_test cluster at /tmp/msh-lab-pg-* as lab_history_app');
}
const { postgresSequelize: db } = await import('../db/postgres-sequelize.js');
const { default: Appointment } = await import('../models/postgres/appointment.model.postgres.js');
const { default: LabTest } = await import('../models/postgres/labTest.model.postgres.js');
const { setRlsContext } = await import('../middleware/rls-context.middleware.js');
const { ensureLabAppointmentHistory, updateLinkedLabHistory } = await import('../services/lab-appointment-history.service.js');
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const asUser = (userId, action) => db.transaction(async transaction => {
  await setRlsContext(transaction, { userId, orgId: 3 });
  return action(transaction);
});
try {
  const [roles] = await db.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  check(!roles[0].rolsuper && !roles[0].rolbypassrls, 'test uses a nonprivileged application role');
  for (const table of ['users', 'doctors', 'hospitals', 'reports', 'prescriptions']) {
    await db.query(`CREATE TABLE "${table}" (id integer PRIMARY KEY)`);
  }
  await db.query('INSERT INTO users(id) VALUES (42), (43)');
  await Appointment.sync();
  await LabTest.sync();
  for (const table of ['appointments', 'lab_tests']) {
    await db.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await db.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    await db.query(`CREATE POLICY patient_own ON "${table}" USING ("userId" = NULLIF(current_setting('app.current_user_id', true), '')::integer) WITH CHECK ("userId" = NULLIF(current_setting('app.current_user_id', true), '')::integer)`);
  }
  let appointmentId;
  const history = await asUser(42, async transaction => {
    const appointment = await Appointment.create({
      userId: 42, organization_id: 3, type: 'lab', consultationType: 'lab-test',
      patientName: 'Disposable QA', patientPhone: '', doctorName: 'Lab',
      appointmentDate: '2026-12-20', appointmentTime: '10:00', status: 'scheduled',
      doctorDetails: { labId: 7, labName: 'Disposable Lab' },
      patientDetails: { notes: 'Initial note' },
      metadata: { serviceType: 'checkup', testType: 'Health Checkup', totalFee: 0, tests: [{ id: 'cbc', name: 'CBC', price: 0 }] },
    }, { transaction });
    appointmentId = appointment.id;
    check(appointment.type === 'lab', 'ORM retains the lab type');
    return ensureLabAppointmentHistory(appointment, { LabTest, transaction });
  });
  await asUser(42, async transaction => {
    const rows = await LabTest.findAll({ where: { userId: 42 }, transaction });
    check(rows.length === 1 && rows[0].id === history.id, 'committed booking is visible in patient history');
    check(rows[0].metadata.appointmentId === appointmentId, 'history links to the correct appointment');
    const appointment = await Appointment.findByPk(appointmentId, { transaction });
    check(appointment.type === 'lab' && appointment.metadata.labTestId === history.id, 'reloaded appointment has lab type and reverse link');
    const repaired = await ensureLabAppointmentHistory(appointment, { LabTest, transaction });
    check(repaired.id === history.id, 'recovery reuses history instead of duplicating it');
  });
  check(await asUser(43, transaction => LabTest.count({ transaction })) === 0, 'another patient cannot read the booking through RLS');
  check(await LabTest.count() === 0, 'an unscoped pooled query cannot read patient history');
  await updateLinkedLabHistory(history, { appointmentDate: new Date('2026-12-21T00:00:00Z'), appointmentTime: '11:00', notes: 'Updated note' }, { Appointment, LabTest, setRlsContext });
  await asUser(42, async transaction => {
    const appointment = await Appointment.findByPk(appointmentId, { transaction });
    check(appointment.appointmentDate === '2026-12-21' && appointment.appointmentTime.startsWith('11:00'), 'reschedule updates the real appointment and its date hook');
    check(appointment.patientDetails.notes === 'Updated note', 'reschedule preserves patient details while changing notes');
  });
  await updateLinkedLabHistory(history, { status: 'cancelled', confirmationStatus: 'rejected', cancelledAt: new Date(), cancellationReason: 'Disposable test', cancelledBy: 'patient' }, { Appointment, LabTest, setRlsContext });
  await asUser(42, async transaction => {
    check((await Appointment.findByPk(appointmentId, { transaction })).status === 'cancelled', 'cancellation releases the appointment slot');
    check((await LabTest.findByPk(history.id, { transaction })).status === 'cancelled', 'cancellation updates patient history');
  });
  const originalCreate = LabTest.create;
  LabTest.create = async () => { throw new Error('Injected history failure'); };
  try {
    await assert.rejects(asUser(42, async transaction => {
      const appointment = await Appointment.create({
        userId: 42, type: 'lab', consultationType: 'lab-test', patientName: 'Disposable rollback',
        patientPhone: '', doctorName: 'Lab', appointmentDate: '2026-12-22', appointmentTime: '10:00',
      }, { transaction });
      await ensureLabAppointmentHistory(appointment, { LabTest, transaction });
    }), /Injected history failure/);
  } finally { LabTest.create = originalCreate; }
  check(await asUser(42, transaction => Appointment.count({ where: { userId: 42 }, transaction })) === 1, 'failed history insert rolls the appointment back in PostgreSQL');
  check(await asUser(42, transaction => LabTest.count({ where: { userId: 42 }, transaction })) === 1, 'no duplicate history survived recovery or rollback');
  console.log(JSON.stringify({ passed: checks, failed: 0, database: 'disposable PostgreSQL', productionWrites: 0 }));
} finally { await db.close(); }
