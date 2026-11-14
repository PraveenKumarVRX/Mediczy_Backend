import { sdkCall } from './transport.js';
const wrapped = new WeakMap();
export function manageMessaging(client) {
  if (!client || wrapped.has(client)) return wrapped.get(client) || client;
  const managed = new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!['send', 'sendEach', 'sendEachForMulticast', 'sendMulticast', 'sendAll', 'sendToDevice', 'sendToTopic', 'subscribeToTopic', 'unsubscribeFromTopic'].includes(key)) return value.bind(target);
      return (...args) => sdkCall('firebase-fcm', () => value.apply(target, args), { idempotent: false });
    },
  });
  wrapped.set(client, managed);
  return managed;
}
