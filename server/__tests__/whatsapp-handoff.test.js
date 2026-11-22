import { jest } from '@jest/globals';

const store = new Map();
jest.unstable_mockModule('../db/redis.js', () => ({
  cache: { get: async (k) => store.get(k) ?? null, set: async (k, v) => { store.set(k, v); }, del: async (k) => { store.delete(k); } },
}));
const { asksForPerson, setHandoffState, getHandoffState, clearHandoffState } = await import('../services/whatsapp-handoff.service.js');

test('recognises a member asking for a person', () => {
  for (const t of ['agent', 'Human', 'customer care', 'talk to a person please', 'can I speak to someone', 'connect me with your team', 'I want a real person', 'call me back']) {
    expect([t, asksForPerson(t)]).toEqual([t, true]);
  }
  for (const t of ['book a health checkup', 'my agent code is 12', 'what is my plan', '', 'support for diabetes diet?']) {
    expect([t, asksForPerson(t)]).toEqual([t, false]);
  }
});

test('hand-off state is keyed by the normalised number', async () => {
  await setHandoffState('9000000001', { reason: 'x' });
  expect(await getHandoffState('whatsapp:+919000000001')).toMatchObject({ active: true, reason: 'x' });
  await clearHandoffState('+919000000001');
  expect(await getHandoffState('9000000001')).toBeNull();
});
