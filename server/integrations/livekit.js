import { RoomServiceClient as Rooms, SipClient as Sip, AgentDispatchClient as Dispatch, TwirpError } from 'livekit-server-sdk';
import { assertSdkEndpoint, vendorFetch } from './transport.js';
export * from 'livekit-server-sdk';

// LiveKit exposes its RPC transport on each client. Replace that boundary so
// redirects, response consumption and deadlines share the managed fetch rules.
const fetch = vendorFetch('livekit');
function camelKeys(value) {
  if (Array.isArray(value)) return value.map(camelKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), camelKeys(item)]));
}
function managedClass(Client) {
  return class extends Client {
    constructor(endpoint, apiKey, secret, options = {}) {
      const host = String(endpoint).replace(/^wss:/, 'https:');
      assertSdkEndpoint('livekit', host);
      super(host, apiKey, secret, { ...options, requestTimeout: Math.min(options.requestTimeout || 8, 8) });
      const rpc = this.rpc;
      rpc.request = async (service, method, data, headers, timeout = rpc.requestTimeout) => {
        const url = new URL(`${rpc.prefix}/${rpc.pkg}.${service}/${method}`, rpc.host);
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', ...headers },
          body: JSON.stringify(data), signal: AbortSignal.timeout(Math.min(timeout || 8, 8) * 1000) });
        let body;
        try { body = await response.json(); } catch (error) {
          if (response.ok) throw error;
          body = {};
        }
        if (!response.ok) throw new TwirpError(response.statusText, body.msg || 'LiveKit request failed', response.status, body.code, body.meta);
        return camelKeys(body);
      };
    }
  };
}
export const RoomServiceClient = managedClass(Rooms);
export const SipClient = managedClass(Sip);
export const AgentDispatchClient = managedClass(Dispatch);
