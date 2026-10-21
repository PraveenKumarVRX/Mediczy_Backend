import fs from 'node:fs';
import vm from 'node:vm';
import { doctorDisplayName, renderNotificationTemplate } from '../utils/doctor-name.js';
import { generateICalFile } from '../utils/icalGenerator.js';

// Evaluate the actual class without booting Firebase, cron or database models.
function isolatedClass(file, name) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = source.indexOf(`class ${name} {`);
  const end = source.indexOf('\n}', start) + 2;
  const context = vm.createContext({ doctorDisplayName, renderNotificationTemplate, console: { log() {} }, process: { env: {} } });
  return vm.runInContext(`${source.slice(start, end)}\n${name}`, context);
}
const Notifications = isolatedClass('../services/notification.service.js', 'NotificationService');
const Reminders = isolatedClass('../services/appointment-notification.service.js', 'AppointmentNotificationService');

describe('appointment notification doctor display names', () => {
  test.each(['Nandita Agarwal', 'Dr. Nandita Agarwal', 'Dr Nandita Agarwal', ' Dr. Dr. Nandita Agarwal ', 'Doctor Nandita Agarwal', 'dr.Nandita Agarwal'])(
    'normalizes a title exactly once: %s', name => expect(doctorDisplayName(name)).toBe('Dr. Nandita Agarwal')
  );
  test.each(['Drew Kumar', 'Drake Rao', 'Doctorow Singh'])(
    'preserves a real name starting with title letters: %s', name => expect(doctorDisplayName(name)).toBe(`Dr. ${name}`)
  );
  test('does not invent a missing name or expand replacement dollar sequences', () => {
    expect(doctorDisplayName(null)).toBe('');
    expect(renderNotificationTemplate('Dr. {{doctorName}} {{message}}', {doctorName: 'Dr. $& Rao', message: '$&'})).toBe('Dr. $& Rao $&');
  });
  test('booking body, email detail table and title-only calling template agree', () => {
    const service = new Notifications();
    const variables = { doctorName: 'Dr. Dr. Nandita Agarwal', date: '2026-11-01', time: '10:00', paymentStatus: 'Pending' };
    const body = service.parseTemplate(service.templates.appointment_booked.message, variables);
    const details = service.getAppointmentDetails('appointment_booked', variables);
    const calling = service.parseTemplate(service.templates.doctor_calling?.title || '{{doctorName}} is calling', variables);
    for (const value of [body, details, calling]) {
      expect(value).toContain('Dr. Nandita Agarwal');
      expect(value).not.toMatch(/Dr\.\s+Dr\./);
    }
    expect(variables.doctorName).toBe('Dr. Dr. Nandita Agarwal'); // stored/caller identity untouched
  });
  test('calendar summary, description and reminder do not double-prefix stored names', () => {
    const calendar = generateICalFile({ id: 1, doctorName: 'Dr. Nandita Agarwal', appointmentDate: '2026-11-01', appointmentTime: '10:00' });
    expect(calendar).toContain('SUMMARY:Medical Appointment - Dr. Nandita Agarwal');
    expect(calendar).toContain('DESCRIPTION:Reminder: Appointment with Dr. Nandita Agarwal');
    expect(calendar).not.toMatch(/Dr\.\s+Dr\./);
  });
  test.each(['send15MinuteWarning', 'send5MinuteWarning', 'sendUrgentCallNotification', 'sendCallNowNotification'])(
    '%s emits normalized names to the patient without changing recipient routing', async method => {
      const emitted = [];
      const service = new Reminders({ to: room => ({ emit: (event, data) => emitted.push({room, event, data}) }) });
      await service[method]({ id: 9, userId: 25, doctorId: 33, doctor: { firstName: 'Dr. Nandita', lastName: 'Agarwal' }, patientName: 'Synthetic patient', metadata: {} });
      expect(emitted).toHaveLength(2);
      expect(emitted[0].room).toBe('user-25');
      expect(emitted[0].data.doctorName).toBe('Dr. Nandita Agarwal');
      expect(emitted[0].data.message).toContain('Dr. Nandita Agarwal');
      expect(emitted[1].room).toBe('doctor-33');
      expect(emitted[0].data.message).not.toContain('undefined');
    }
  );
});

describe('HR team direct-login entry', () => {
  const source = fs.readFileSync(new URL('../routes/corporate/hr-management.routes.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function withDirectLoginEntry'), source.indexOf('\nconst wrap ='));
  const fn = vm.runInNewContext(`${body}\nwithDirectLoginEntry`, {
    corporateId: req => req.user.corporateId,
    Corporate: { findByPk: async id => id === 3 ? {id: 3, contactPerson: 'Direct Contact', email: 'direct@example.invalid', createdAt: '2026-01-01'} : null },
  });
  test('keeps corporate and users identity namespaces distinct', async () => {
    const actualUser = {id: 3, role: 'corporate_admin'};
    const rows = await fn({user: {role: 'corporate', corporateId: 3}}, [actualUser]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({id: 'corporate:3', isDirectLogin: true, role: 'corporate_admin', firstName: 'Direct'});
    expect(rows[1]).toBe(actualUser);
  });
  test('does not add a corporate alias to an invited staff session', async () => {
    const team = [{id: 4, role: 'hr_staff'}];
    expect(await fn({user: {role: 'hr_staff', corporateId: 3}}, team)).toBe(team);
  });
});
