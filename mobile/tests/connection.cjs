const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConnectionManager, canonicalOrigin } = require(process.env.CONNECTION_CORE);
const discovery = (id = 'deployment-0001', product = 'crm', registration = 'disabled') => ({ product: 'mediczy-mobile', mobileApiVersion: 1, apiBasePath: '/api', deploymentId: id, displayName: id, products: [{ id: product, registration }] });
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
function store() { const data = new Map(); return { data, getItem: async k => data.get(k) || null, setItem: async (k, v) => { data.set(k, v); }, removeItem: async k => { data.delete(k); } }; }
function setup(transport, product = 'crm') { const storage = store(), secure = store(); return { storage, secure, manager: new ConnectionManager(product, 'com.example.app', storage, secure, transport) }; }

test('canonicalises HTTPS origins and rejects ambiguous/credential-bearing input', () => {
  assert.equal(canonicalOrigin(' HTTPS://Example.org:443/ '), 'https://example.org');
  assert.equal(canonicalOrigin('https://private.example:8443'), 'https://private.example:8443');
  for (const value of ['http://example.org', 'https://user:pass@example.org', 'https://example.org/api', 'https://example.org?', 'https://example.org#', 'https://example.org\\@evil.org', '//example.org']) assert.throws(() => canonicalOrigin(value));
});
test('unsupported discovery cannot activate a connection', async () => {
  const { manager } = setup(async () => response(discovery('deployment-0001', 'patient')));
  await assert.rejects(manager.connect('https://a.example')); assert.equal(manager.connection, null);
});
test('late response from A cannot activate A after B has connected', async () => {
  let resolveA;
  const { manager } = setup(async url => url.startsWith('https://a.') ? new Promise(resolve => { resolveA = resolve; }) : response(discovery('deployment-0002')));
  const first = manager.connect('https://a.example');
  await manager.connect('https://b.example'); resolveA(response(discovery()));
  await assert.rejects(first); assert.equal(manager.connection.origin, 'https://b.example');
});
test('tokens remain on selected origin; absolute/escaped request paths are rejected', async () => {
  const calls = [];
  const { manager, secure } = setup(async (url, init) => { calls.push({ url, init }); return response(url.endsWith('/discovery') ? discovery() : url.endsWith('/login') ? { token: 'a-token' } : { ok: true }); });
  await manager.connect('https://a.example'); await manager.login('a@example.org', 'password'); await manager.request('/api/crm/profile');
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer a-token');
  assert.match([...secure.data.keys()][0], /^[\w.-]+$/);
  await assert.rejects(manager.request('https://evil.example/api')); await assert.rejects(manager.request('/api/../secret'));
  await manager.connect('https://b.example'); await manager.request('/api/crm/profile');
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
});
test('switch during login rejects old session without storing its token', async () => {
  let resolveLogin;
  const { manager, secure } = setup(async url => url.endsWith('/login') ? new Promise(resolve => { resolveLogin = resolve; }) : response(discovery()));
  await manager.connect('https://a.example'); const login = manager.login('test@example.org', 'password');
  await manager.connect('https://b.example'); resolveLogin(response({ token: 'old-token' }));
  await assert.rejects(login); assert.equal(secure.data.size, 0); assert.equal(manager.connection.origin, 'https://b.example');
});
test('remembered deployment identity changes fail closed before authentication', async () => {
  const { manager } = setup(async () => response(discovery('replacement-0001')));
  await assert.rejects(manager.connect('https://a.example', 'original-0001'), /identity changed/); assert.equal(manager.connection, null);
});
test('redirected discovery responses cannot become a connection', async () => {
  const { manager } = setup(async () => ({ ok: true, redirected: true, url: 'https://evil.example', json: async () => discovery() }));
  await assert.rejects(manager.connect('https://a.example'), /redirects/);
});
test('restore recovers only metadata, never sends traffic or adopts a legacy token', async () => {
  const { manager, storage } = setup(async () => response(discovery()));
  await manager.connect('https://a.example');
  const restored = new ConnectionManager('crm', 'com.example.app', storage, store(), () => { throw Error('unexpected traffic'); });
  assert.equal((await restored.restore()).origin, 'https://a.example'); assert.equal(restored.connection, null);
  await assert.rejects(restored.request('/api/crm/profile'));
});
test('patient signup respects policy, keeps destination and handles nested token contract', async () => {
  const calls = [];
  const { manager } = setup(async (url, init) => { calls.push({ url, init }); return response(url.endsWith('/discovery') ? discovery('deployment-0001', 'patient', 'open') : { data: { token: 'patient-token' } }); }, 'patient');
  await manager.connect('https://rado.example'); await manager.signup('patient@example.org', 'longpassword', 'First', 'Last');
  assert.equal(calls.at(-1).url, 'https://rado.example/api/patient/signup');
  assert.equal(JSON.parse(calls.at(-1).init.body).clinic_domain, 'rado.example');
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
  const disabled = setup(async () => response(discovery('deployment-0001', 'patient')), 'patient').manager;
  await disabled.connect('https://rado.example'); await assert.rejects(disabled.signup('x', 'password', 'a', 'b'), /managed/);
});
