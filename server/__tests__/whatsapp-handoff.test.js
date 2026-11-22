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

test('a Gupshup photo or document message carries its file for the desk', async () => {
  const { normalizeGupshupEvent } = await import('../services/gupshup-webhook.service.js');
  const env = { GUPSHUP_APP_NAME: 'App', GUPSHUP_SOURCE_NUMBER: '918098998998' };
  const base = { app: 'App', version: 2, type: 'message' };
  const doc = normalizeGupshupEvent({ ...base, payload: { id: 'm1', source: '919000000001', type: 'file', sender: { name: 'A' },
    payload: { url: 'https://filemanager.gupshup.io/wa/x', name: 'report.pdf', contentType: 'application/pdf', caption: 'my report' } } }, env);
  expect(doc).toMatchObject({ unsupportedMedia: true, media: { type: 'file', name: 'report.pdf', caption: 'my report' },
    message: { Body: 'my report', NumMedia: '1', MediaUrl0: 'https://filemanager.gupshup.io/wa/x' } });
  const insecure = normalizeGupshupEvent({ ...base, payload: { id: 'm2', source: '919000000001', type: 'image', payload: { url: 'http://x/y.jpg' } } }, env);
  expect(insecure.media).toBeNull();
  const text = normalizeGupshupEvent({ ...base, payload: { id: 'm3', source: '919000000001', type: 'text', payload: { text: 'hi' } } }, env);
  expect(text).toMatchObject({ unsupportedMedia: false, media: null, message: { NumMedia: '0' } });
});
