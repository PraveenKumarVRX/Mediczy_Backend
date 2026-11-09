import { jest } from '@jest/globals';
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: {} }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext: jest.fn() }));
jest.unstable_mockModule('../services/notification-preferences.service.js', () => ({ getNotificationPreferences: jest.fn() }));
const { preferenceReminderDecision, sendPreferenceReminders } = await import('../services/appointment-preference-reminders.service.js');
const appointment = { id: 7, userId: 42, appointmentDate: '2026-10-21', appointmentTime: '18:30', metadata: {} };
const now = Date.parse('2026-10-21T12:00:00Z'); // 17:30 IST
it('honors selected lead time, disabled reminders, and future appointments', () => {
  expect(preferenceReminderDecision(appointment,{reminderMinutesBefore:30},now)).toBeNull();
  expect(preferenceReminderDecision(appointment,{reminderMinutesBefore:60},now)?.minutes).toBe(60);
  expect(preferenceReminderDecision(appointment,{appointmentReminders:false,reminderMinutesBefore:60},now)).toBeNull();
  expect(preferenceReminderDecision(appointment,{reminderMinutesBefore:60},Date.parse('2026-10-21T14:00Z'))).toBeNull();
});
it('does not repeat a committed reminder and allows a rescheduled time', () => {
  const row={...appointment,metadata:{preferenceReminderKey:'2026-10-21/18:30/60'}};
  expect(preferenceReminderDecision(row,{reminderMinutesBefore:60},now)).toBeNull();
  expect(preferenceReminderDecision({...row,appointmentTime:'18:31'},{reminderMinutesBefore:60},now+60000)).not.toBeNull();
});
it('persists the employee inbox notification and marker in one RLS transaction before delivery', async () => {
  const transaction={}; let committed=false;
  const database={QueryTypes:{SELECT:'SELECT'},query:jest.fn().mockResolvedValueOnce([appointment]).mockResolvedValueOnce([{id:8}]).mockResolvedValueOnce([{id:7}]),transaction:async fn=>{const result=await fn(transaction);committed=true;return result;}};
  const setContext=jest.fn(); const delivery=jest.fn(async()=>expect(committed).toBe(true));
  expect(await sendPreferenceReminders({database,setContext,preferencesFor:async()=>({reminderMinutesBefore:60}),delivery,now})).toEqual({sent:1});
  expect(database.query.mock.calls[1][1].replacements.userId).toBe(42);
  expect(database.query.mock.calls.every(([,opts])=>opts.transaction===transaction)).toBe(true);
  expect(setContext).toHaveBeenCalledWith(transaction,{orgId:0,userId:0,isPlatformAdmin:true});
  expect(delivery).toHaveBeenCalledTimes(1);
});

it('ties the reminder to its appointment so it cannot outlive it as a phantom', async () => {
  const transaction = {};
  const database = { QueryTypes:{SELECT:'SELECT'}, query: jest.fn()
    .mockResolvedValueOnce([appointment]).mockResolvedValueOnce([{id:8}]).mockResolvedValueOnce([{id:7}]),
    transaction: async fn => fn(transaction) };
  await sendPreferenceReminders({ database, setContext: jest.fn(),
    preferencesFor: async () => ({ reminderMinutesBefore: 60 }), now });
  const [sql, opts] = database.query.mock.calls[1];
  expect(sql).toMatch(/INSERT INTO notifications/);
  // Without a `data` payload the row named no appointment, so a reminder for a
  // deleted appointment could not be told from a live one.
  expect(sql).toMatch(/\bdata\b/);
  expect(JSON.parse(opts.replacements.data)).toEqual({ appointmentId: 7, reminderMinutesBefore: 60 });
});

it('does not mislabel a late catch-up as the configured lead time', () => {
  const late = Date.parse('2026-10-21T12:59:00Z');
  expect(preferenceReminderDecision(appointment, {reminderMinutesBefore:30}, late)).toBeNull();
});
it('uses friendly IST time and doctor name without repeated honorifics', () => {
  const result = preferenceReminderDecision({...appointment, doctorName:'Dr. Dr Nandita Agarwal'}, {reminderMinutesBefore:60}, now);
  expect(result.message).toMatch(/Today, 6:30 pm with Dr\. Nandita Agarwal/i);
});
