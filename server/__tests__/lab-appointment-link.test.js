import { jest } from '@jest/globals';

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const Appointment = { findOne: jest.fn() };
const LabTest = {
  create: jest.fn(), update: jest.fn(), findOne: jest.fn(),
  sequelize: { transaction: jest.fn(fn => fn(transaction)) },
};
const setRlsContext = jest.fn();
jest.unstable_mockModule('../models/index.js', () => ({ Appointment, LabTest }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext }));
const { createLinkedLabTest, syncLabTestFromAppointment, updateLinkedLabTest } = await import('../services/lab-appointment-link.service.js');
const booking = () => ({
  id: 12, userId: 42, type: 'lab', status: 'scheduled',
  appointmentDate: '2026-12-01', appointmentTime: '10:00',
  metadata: { testType: 'checkup', totalFee: 100, tests: [{ name: 'CBC' }] },
  doctorDetails: { labId: 9 }, update: jest.fn(),
});
beforeEach(() => {
  jest.clearAllMocks();
  LabTest.findOne.mockResolvedValue(null);
  LabTest.create.mockResolvedValue({ id: 21 });
  LabTest.update.mockResolvedValue([1]);
});

it('creates history and reverse link in the supplied transaction without treating lab IDs as hospitals', async () => {
  const appointment = booking();
  await createLinkedLabTest(appointment, transaction);
  expect(LabTest.create).toHaveBeenCalledWith(expect.objectContaining({
    userId: 42, testType: 'other', testName: 'CBC', total_amount: 100,
    metadata: expect.objectContaining({ appointmentId: 12, labId: 9 }),
  }), { transaction });
  expect(LabTest.create.mock.calls[0][0].hospitalId).toBeUndefined();
  expect(appointment.update).toHaveBeenCalledWith({ metadata: expect.objectContaining({ labTestId: 21 }) }, { transaction });
});
it('propagates creation failure without writing a reverse link', async () => {
  const appointment = booking();
  LabTest.create.mockRejectedValueOnce(new Error('insert failed'));
  await expect(createLinkedLabTest(appointment, transaction)).rejects.toThrow('insert failed');
  expect(appointment.update).not.toHaveBeenCalled();
});
it('synchronizes rescheduling without resetting confirmation', async () => {
  const appointment = booking(); appointment.metadata.labTestId = 21;
  await syncLabTestFromAppointment(appointment, transaction);
  expect(LabTest.update).toHaveBeenCalledWith({ appointmentDate: appointment.appointmentDate, appointmentTime: '10:00' }, {
    where: { id: 21, userId: 42, 'metadata.appointmentId': 12 }, transaction,
  });
});
it('synchronizes appointment-side cancellation', async () => {
  const appointment = booking(); appointment.metadata.labTestId = 21; appointment.status = 'cancelled';
  await syncLabTestFromAppointment(appointment, transaction);
  expect(LabTest.update.mock.calls[0][0]).toMatchObject({ status: 'cancelled', confirmationStatus: 'rejected' });
});
it('does not touch unlinked appointments', async () => {
  await syncLabTestFromAppointment(booking(), transaction);
  expect(LabTest.update).not.toHaveBeenCalled();
});
it('synchronizes history edits using owner, a row lock and reciprocal reference', async () => {
  const lab = { id: 21, userId: 42, status: 'pending_confirmation', metadata: { source: 'lab_appointment', appointmentId: 12 }, update: jest.fn() };
  const appointment = booking(); appointment.metadata.labTestId = 21;
  LabTest.findOne.mockResolvedValue(lab);
  Appointment.findOne.mockResolvedValue(appointment);
  await updateLinkedLabTest({ user: { id: 42 } }, lab, { appointmentTime: '11:00' });
  expect(Appointment.findOne).toHaveBeenCalledWith({ where: { id: 12, userId: 42, type: 'lab' }, transaction, lock: 'UPDATE' });
  expect(appointment.update).toHaveBeenCalledWith({ appointmentTime: '11:00' }, { transaction });
  expect(lab.update).toHaveBeenCalledWith({ appointmentTime: '11:00' }, { transaction });
  expect(setRlsContext).toHaveBeenCalledWith(transaction, { userId: 42, orgId: 0 });
});
it('rejects a broken reverse link before updating history', async () => {
  const lab = { id: 21, userId: 42, metadata: { source: 'lab_appointment', appointmentId: 12 }, update: jest.fn() };
  Appointment.findOne.mockResolvedValue(booking());
  await expect(updateLinkedLabTest({ user: { id: 42 } }, lab, { appointmentTime: '11:00' })).rejects.toThrow('different history');
  expect(lab.update).not.toHaveBeenCalled();
});
it('rejects a missing history record so appointment changes roll back', async () => {
  const appointment = booking(); appointment.metadata.labTestId = 21;
  LabTest.update.mockResolvedValueOnce([0]);
  await expect(syncLabTestFromAppointment(appointment, transaction)).rejects.toThrow('not found');
});

it('rejects an owner mismatch before opening a transaction', async () => {
  await expect(updateLinkedLabTest({ user: { id: 43 } }, { userId: 42 }, {})).rejects.toThrow('owner mismatch');
  expect(setRlsContext).not.toHaveBeenCalled();
});
