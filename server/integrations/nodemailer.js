import nodemailer from 'nodemailer';
import { sdkCall } from './transport.js';

const managed = new WeakSet();
export function manageMailTransport(transport) {
  if (managed.has(transport)) return transport;
  managed.add(transport);
  for (const method of ['sendMail', 'verify']) {
    if (typeof transport[method] !== 'function') continue;
    const original = transport[method].bind(transport);
    transport[method] = (...args) => {
      const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
      const result = sdkCall('smtp', () => original(...args), { idempotent: false });
      if (callback) { result.then(value => callback(null, value), callback); return; }
      return result;
    };
  }
  return transport;
}

const managedNodemailer = {
  ...nodemailer,
  createTransport(options, defaults) {
    // Per-mailbox credentials are supplied by the existing encrypted account configuration.
    const bounded = typeof options === 'object' && options !== null ? {
      ...options, connectionTimeout: Math.min(options.connectionTimeout || 8000, 8000),
      greetingTimeout: Math.min(options.greetingTimeout || 8000, 8000),
      socketTimeout: Math.min(options.socketTimeout || 8000, 8000),
    } : options;
    return manageMailTransport(nodemailer.createTransport(bounded, defaults));
  },
};

export default managedNodemailer;
export const createTransport = (...args) => managedNodemailer.createTransport(...args);
