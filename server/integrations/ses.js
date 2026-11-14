import { SESv2Client as Client } from '@aws-sdk/client-sesv2';
import { sdkCall } from './transport.js';
export * from '@aws-sdk/client-sesv2';
export class SESv2Client extends Client {
  constructor(config = {}) { super({ ...config, maxAttempts: 1 }); }
  send(command, options = {}, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    const promise = sdkCall('aws-ses', signal => super.send(command, { ...options,
      abortSignal: options.abortSignal ? AbortSignal.any([signal, options.abortSignal]) : signal,
    }), { idempotent: false });
    if (callback) { promise.then(value => callback(null, value), callback); return; }
    return promise;
  }
}
