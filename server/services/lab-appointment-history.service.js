// /labs/book stores appointments; patient Orders reads lab_tests. Persist the
// history projection in the SAME transaction, with links in both directions.
// Lab IDs belong to labs, whereas LabTest.hospitalId references hospitals: keep
// the lab identity in metadata rather than writing a different table's ID.
const VALID_TEST_TYPES = new Set([
  'blood_test', 'pathology', 'radiology', 'scan', 'ultrasound', 'xray',
  'ct_scan', 'mri', 'ecg', 'echo', 'eeg', 'endoscopy', 'colonoscopy', 'other',
]);
const HISTORY_STATUS = {
  confirmed: 'booked', accepted: 'booked', 'in-progress': 'booked',
  completed: 'completed', cancelled: 'cancelled', rejected: 'cancelled',
  'no-show': 'no_show', rescheduled: 'rescheduled',
};

// Older ORM versions dropped `type` on insert. A lab-test consultation with
// an explicit lab directory reference is still an identifiable lab booking.
export const isLabAppointmentRecord = appointment => appointment?.type === 'lab' ||
  (appointment?.consultationType === 'lab-test' && appointment?.doctorDetails?.labId != null);

export async function ensureLabAppointmentHistory(appointment, { LabTest, transaction }) {
  if (!transaction) throw new Error('Lab history requires the appointment transaction');
  if (!isLabAppointmentRecord(appointment) || !appointment.userId) {
    throw new Error('Only patient-owned lab appointments can be linked');
  }
  const details = appointment.metadata || {};
  // The caller holds the appointment row lock when repairing old bookings.
  let history = await LabTest.findOne({
    where: { userId: appointment.userId, metadata: { source: 'lab_appointment', appointmentId: appointment.id } },
    transaction,
  });
  if (!history) {
    const tests = Array.isArray(details.tests) ? details.tests : [];
    const testName = tests.map(test => typeof test === 'string' ? test : test?.name).filter(Boolean).join(', ');
    const lab = appointment.doctorDetails || {};
    const total = Number(details.totalFee);
    const amount = details.totalFee != null && Number.isFinite(total) && total >= 0 ? total : null;
    const status = HISTORY_STATUS[appointment.status] || 'pending_confirmation';
    history = await LabTest.create({
      userId: appointment.userId,
      organization_id: appointment.organization_id ?? null,
      testType: VALID_TEST_TYPES.has(details.testType) ? details.testType : 'other',
      testName: (testName || details.testType || 'Lab appointment').slice(0, 255),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      status,
      confirmationStatus: status === 'cancelled' ? 'rejected' : status === 'pending_confirmation' ? 'pending' : 'confirmed',
      resultStatus: 'pending',
      notes: appointment.patientDetails?.notes || null,
      price: amount,
      total_amount: amount,
      currency: 'INR',
      createdAt: appointment.createdAt,
      metadata: {
        source: 'lab_appointment', appointmentId: appointment.id,
        labId: lab.labId, labName: lab.labName, labAddress: lab.labAddress,
        patientName: appointment.patientName,
        serviceType: details.serviceType, requestedTestType: details.testType,
        tests, bookingFor: details.bookingFor || 'self',
        familyMemberId: details.familyMemberId ?? null,
      },
    }, { transaction });
  }
  if (String(details.labTestId ?? '') !== String(history.id) || appointment.type !== 'lab') {
    await appointment.update({ type: 'lab', metadata: { ...details, labTestId: history.id } }, { transaction });
  }
  return history;
}

// Lab Orders already exposes confirm/cancel/reschedule. A projection must not
// leave the appointment (and its reserved slot) unchanged when those run.
export async function updateLinkedLabHistory(labTest, changes, { Appointment, LabTest, setRlsContext }) {
  return LabTest.sequelize.transaction(async transaction => {
    await setRlsContext(transaction, { userId: labTest.userId, orgId: labTest.organization_id || 0 });
    let appointment = null;
    if (labTest.metadata?.source === 'lab_appointment') {
      appointment = await Appointment.findOne({
        where: { id: labTest.metadata.appointmentId, userId: labTest.userId },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!appointment || !isLabAppointmentRecord(appointment)) throw new Error('Linked lab appointment was not found');
      if (String(appointment.metadata?.labTestId) !== String(labTest.id)) {
        throw new Error('Linked lab appointment has a different history reference');
      }
    }
    const current = await LabTest.findOne({
      where: { id: labTest.id, userId: labTest.userId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!current || current.status !== labTest.status) throw new Error('Lab booking changed. Refresh before trying again.');
    if (appointment) {
      const terminal = ['cancelled', 'rejected', 'completed', 'no-show'];
      const repeatCancellation = ['cancelled', 'rejected'].includes(appointment.status) && changes.status === 'cancelled';
      if (terminal.includes(appointment.status) && !repeatCancellation) {
        throw new Error('This lab appointment can no longer be changed');
      }
      const patch = {};
      if (appointment.type !== 'lab') patch.type = 'lab';
      if (changes.status === 'booked') patch.status = 'confirmed';
      if (changes.status === 'cancelled') {
        patch.status = 'cancelled';
        patch.cancelledAt = changes.cancelledAt;
        patch.cancellationReason = changes.cancellationReason;
        patch.cancelledBy = labTest.userId;
      }
      if (changes.appointmentDate) {
        patch.appointmentDate = changes.appointmentDate instanceof Date
          ? changes.appointmentDate.toISOString().slice(0, 10) : changes.appointmentDate;
      }
      if (changes.appointmentTime) patch.appointmentTime = changes.appointmentTime;
      if (changes.notes !== undefined) patch.patientDetails = { ...appointment.patientDetails, notes: changes.notes };
      await appointment.update(patch, { transaction });
    }
    await current.update(changes, { transaction });
    return current;
  });
}
