import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
vi.mock('axios', () => ({ default: { post: vi.fn(), delete: vi.fn(), get: vi.fn() } }));
vi.mock('@/hooks/auth', () => ({ getToken: () => 'current-role-token' }));
import { drIshaAPI } from '../drIsha';

describe('actual Dr. iSHA API client', () => {
  beforeEach(() => { vi.clearAllMocks(); drIshaAPI.startNewSession(); });
  it('uses active role auth and server-issued response sessions', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { success: true, response: 'Answer', sessionId: 'chat_server', confidence: 0 } });
    const result = await drIshaAPI.consult('general question', 'en', { sessionId: '' });
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sessionId: undefined }), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer current-role-token' }) }));
    expect(result.sessionId).toBe('chat_server');
    expect(result.data?.confidence).toBe(0);
  });
  it('does not log axios configuration or authorization on failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(axios.post).mockRejectedValue({ response: { status: 403, data: { error: 'denied' } }, config: { headers: { Authorization: 'secret-token' } } });
    expect((await drIshaAPI.consult('question')).success).toBe(false);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('question');
    spy.mockRestore();
  });
  it('clears the supplied conversation rather than an implicit global session', async () => {
    vi.mocked(axios.delete).mockResolvedValue({ data: { success: true } });
    await drIshaAPI.clearSession('chat_owned');
    expect(axios.delete).toHaveBeenCalledWith(expect.stringContaining('/session/chat_owned'), expect.any(Object));
  });
  it('loads the explicitly supplied conversation without an implicit client-generated ID', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { success: true, history: [] } });
    expect((await drIshaAPI.getSessionHistory('chat_owned')).success).toBe(true);
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/session/chat_owned'), expect.any(Object));
  });

});
