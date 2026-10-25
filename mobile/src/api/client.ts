/** No default server or legacy global token: every call uses the selected connection. */
import { connectionManager } from '../connection/runtime';
export { connectionManager };
const apiClient = {
  get: async (path: string) => ({ data: await connectionManager.request(path.startsWith('/api/') ? path : `/api${path}`) }),
  post: async (path: string, body?: unknown) => ({ data: await connectionManager.request(path.startsWith('/api/') ? path : `/api${path}`, body ?? {}) }),
};
export default apiClient;
