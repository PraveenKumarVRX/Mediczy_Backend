import { afterEach, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';
vi.mock('@/hooks/auth', () => ({ getToken: () => 'admin-secret', getUserType: () => 'admin' }));
import api from '@/utils/api';
import { communicationRequestOptions } from './portalSession';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('refreshes Team rather than clearing Admin when the remembered global role is Admin', async () => {
  localStorage.setItem('teamRefreshToken', 'team-refresh'); localStorage.setItem('adminToken', 'admin-secret');
  const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, token: 'renewed-team' } });
  let attempts = 0;
  const result = await api.get('/chat/rooms', {
    ...communicationRequestOptions('old-team', {}, 'team'),
    adapter: async config => {
      if (++attempts === 1) throw new AxiosError('expired', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data: {}, headers: {}, statusText: 'Unauthorized', config });
      return { status: 200, data: { rooms: [] }, headers: {}, statusText: 'OK', config };
    },
  });
  expect(result.status).toBe(200); expect(attempts).toBe(2);
  expect(refresh).toHaveBeenCalledWith(expect.stringContaining('/team/auth/refresh'), { refreshToken: 'team-refresh' }, expect.anything());
  expect(localStorage.getItem('adminToken')).toBe('admin-secret');
  expect(result.config.headers.Authorization).toBe('Bearer renewed-team');
});
