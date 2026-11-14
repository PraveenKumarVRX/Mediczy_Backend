// Explicit, patient-scoped recovery. Dry run by default; no global scans or
// elevated RLS bypass. Run with the same database configuration as the server.
import { ensureLabAppointmentHistory } from '../services/lab-appointment-history.service.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/backfill-lab-appointment-history.mjs --user-id=42 --appointment-id=77 [--appointment-id=78] [--org-id=3] [--apply]');
  console.log('Default: read-only preview. --apply creates missing history rows and repairs links.');
  process.exit(0);
}
const positiveId = value => /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const userArg = args.find(arg => arg.startsWith('--user-id='))?.split('=')[1];
const orgArg = args.find(arg => arg.startsWith('--org-id='))?.split('=')[1] ?? '0';
const appointmentArgs = args.filter(arg => arg.startsWith('--appointment-id=')).map(arg => arg.split('=')[1]);
if (!positiveId(userArg) || !/^(0|[1-9]\d*)$/.test(orgArg) || !Number.isSafeInteger(Number(orgArg)) ||
    !appointmentArgs.length || appointmentArgs.length > 100 || !appointmentArgs.every(positiveId) ||
    args.some(arg => !/^(--user-id=\d+|--org-id=\d+|--appointment-id=\d+|--apply)$/.test(arg))) {
  console.error('Supply a positive --user-id and 1–100 positive --appointment-id values. Use --help for usage.');
  process.exit(1);
}
const { Appointment, LabTest } = await import('../models/index.js');
const { setRlsContext } = await import('../middleware/rls-context.middleware.js');
try {
  for (const id of [...new Set(appointmentArgs.map(Number))]) {
    const result = await Appointment.sequelize.transaction(async transaction => {
      await setRlsContext(transaction, { userId: Number(userArg), orgId: Number(orgArg) });
      const appointment = await Appointment.findOne({
        where: { id, userId: Number(userArg), type: 'lab' },
        transaction,
        ...(args.includes('--apply') ? { lock: transaction.LOCK.UPDATE } : {}),
      });
      if (!appointment) throw new Error(`Appointment ${id} is not visible as a lab booking for this user/context`);
      const existing = await LabTest.findOne({
        where: { userId: Number(userArg), metadata: { source: 'lab_appointment', appointmentId: id } },
        transaction,
      });
      if (!args.includes('--apply')) return { appointmentId: id, labTestId: existing?.id ?? null, action: existing ? 'link existing history' : 'create history', dryRun: true };
      const history = await ensureLabAppointmentHistory(appointment, { LabTest, transaction });
      return { appointmentId: id, labTestId: history.id, action: existing ? 'linked existing history' : 'created history', dryRun: false };
    });
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error('Lab history repair stopped:', error.message);
  process.exitCode = 1;
} finally {
  await Appointment.sequelize.close();
}
