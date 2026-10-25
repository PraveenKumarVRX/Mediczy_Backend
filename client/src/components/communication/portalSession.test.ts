import { describe, expect, it } from 'vitest';
import { communicationSession, communicationRequestOptions } from './portalSession';
describe('portal authority', () => {
  const storage = { getItem: (key: string) => ({ adminToken: 'admin-session', teamToken: 'team-session' }[key] || null) };
  it('keeps simultaneous portal sessions separate', () => {
    expect(communicationSession('team', storage).token).toBe('team-session');
    expect(communicationSession('admin', storage).token).toBe('admin-session');
  });
  it('never falls back to another portal', () => {
    expect(communicationSession('team', { getItem: key => key === 'adminToken' ? 'admin' : null }).token).toBeNull();
    expect(communicationRequestOptions(null).headers.Authorization).toBe('Bearer unavailable');
  });
  it('overrides foreign authority and preserves parameters', () => {
    expect(communicationRequestOptions('team', { params: { limit: 10 }, headers: { Authorization: 'Bearer admin' } }))
      .toEqual({ params: { limit: 10 }, headers: { Authorization: 'Bearer team' } });
  });
});
