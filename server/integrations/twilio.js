import twilio from 'twilio';
import { sdkCall, assertSdkEndpoint } from './transport.js';

function managedTwilio(accountSid, authToken, options = {}) {
  const client = twilio(accountSid, authToken, { ...options, autoRetry: false, timeout: 8000 });
  const request = client.request.bind(client);
  client.request = opts => {
    assertSdkEndpoint('twilio', opts.uri);
    return sdkCall('twilio', () => request({ ...opts, timeout: 8000, allowRedirects: false }), {
      configuration: Boolean(accountSid && authToken),
      idempotent: ['GET', 'HEAD', 'OPTIONS'].includes(String(opts.method).toUpperCase()),
      statusOf: response => response.statusCode,
    });
  };
  return client;
}
Object.assign(managedTwilio, twilio);
export default managedTwilio;
