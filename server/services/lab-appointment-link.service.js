// Compatibility entry points used by the existing appointment controller.
// All creation and patient-side updates share the transaction/locking policy.
import { Appointment, LabTest } from '../models/index.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { ensureLabAppointmentHistory, updateLinkedLabHistory, isLabAppointmentRecord } from './lab-appointment-history.service.js';

export const createLinkedLabTest = (appointment, transaction) =>
  ensureLabAppointmentHistory(appointment, { LabTest, transaction });

export async function updateLinkedLabTest(req, labTest, changes) {
  if (String(req.user?.id) !== String(labTest.userId)) throw new Error('Lab booking owner mismatch');
  return updateLinkedLabHistory(labTest, changes, { Appointment, LabTest, setRlsContext });
}

// Appointment-side changes must keep patient Lab Orders synchronized too.
// The caller's appointment repository owns the RLS transaction and rollback.
export async function syncLabTestFromAppointment(appointment, transaction) {
  if (!isLabAppointmentRecord(appointment) || !appointment.metadata?.labTestId) return;
  if (!transaction) throw new Error('Lab history synchronization requires a transaction');
  const changes = { appointmentDate: appointment.appointmentDate, appointmentTime: appointment.appointmentTime };
  if (appointment.status === 'cancelled') Object.assign(changes, {
    status: 'cancelled', confirmationStatus: 'rejected', cancelledAt: appointment.cancelledAt,
    cancellationReason: appointment.cancellationReason, cancelledBy: 'patient',
  });
  const [count] = await LabTest.update(changes, {
    where: { id: appointment.metadata.labTestId, userId: appointment.userId, 'metadata.appointmentId': appointment.id },
    transaction,
  });
  if (count !== 1) throw new Error('Linked lab test was not found');
}
