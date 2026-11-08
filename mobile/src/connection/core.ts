export type Product = 'patient' | 'phlebo' | 'crm' | 'smart-force';
export interface Discovery {
  product: 'mediczy-mobile'; mobileApiVersion: 1; apiBasePath: '/api';
  deploymentId: string; displayName: string;
  products: { id: Product; registration: 'disabled' | 'open' }[];
}
export interface Connection { origin: string; discovery: Discovery }
export interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

export function canonicalOrigin(input: string): string {
  const value = input.trim();
  if (!/^https:\/\//i.test(value) || /[\\\s?#]/.test(value)) throw new Error('Enter an HTTPS server address without a path, query or fragment.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid organisation server address.'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter only the HTTPS server address, without credentials or a path.');
  return url.origin;
}
export function validateDiscovery(value: unknown, product: Product): Discovery {
  const d = value as Discovery;
  if (!d || d.product !== 'mediczy-mobile' || d.mobileApiVersion !== 1 || d.apiBasePath !== '/api' ||
      typeof d.deploymentId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(d.deploymentId) ||
      typeof d.displayName !== 'string' || !d.displayName.trim() || d.displayName.length > 100 ||
      !Array.isArray(d.products) || !d.products.some(p => p?.id === product && ['disabled', 'open'].includes(p.registration))) {
    throw new Error('This server does not support this app version or product. Contact your administrator.');
  }
  return d;
}

// One manager per branded app. All callbacks and requests capture a generation.
// Jobs/queues must keep this same connection identity, never rewrite destinations.
export class ConnectionManager {
  private generation = 0;
  private active: Connection | null = null;
  private token: string | null = null;
  private controllers = new Set<AbortController>();
  private listeners = new Set<() => void>();
  private persistence: Promise<void> = Promise.resolve();
  readonly metadataKey: string;
  constructor(readonly product: Product, readonly appId: string, private storage: Storage, private secure: Storage, private transport: Transport = fetch) {
    this.metadataKey = `mobile.connection.v1.${appId}.${product}`;
  }
  get connection() { return this.active; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { this.listeners.forEach(listener => listener()); }
  private invalidate() {
    this.generation++; this.controllers.forEach(c => c.abort()); this.controllers.clear();
    this.active = null; this.token = null; this.notify();
  }
  private persist(work: () => Promise<void>) {
    const task = this.persistence.then(work); this.persistence = task.catch(() => {}); return task;
  }
  private tokenKey(c: Connection) { return `mobile.session.v1.${Array.from(JSON.stringify([this.appId, this.product, c.origin, c.discovery.deploymentId])).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`; }
  private async send(origin: string, path: string, init: RequestInit = {}, generation = this.generation) {
    // The path charset deliberately excludes '.', so '/api/../admin' cannot be
    // built; a query string is allowed after it but may not contain '/', '?' or
    // '#', so it can never reintroduce a path segment or a fragment.
    if (!/^\/api\/[a-zA-Z0-9/_-]+(\?[A-Za-z0-9_=&%.,:+-]*)?$/.test(path)) throw new Error('Only relative API paths are allowed.');
    const controller = new AbortController(); this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.transport(origin + path, { ...init, signal: controller.signal, redirect: 'error', credentials: 'omit' });
      if (generation !== this.generation) throw new Error('Connection changed. Try again.');
      // Native transports may follow redirects despite redirect:error. Reject their
      // result too; server/proxy must never redirect credential-bearing endpoints.
      if (response.redirected || (response.url && new URL(response.url).origin !== origin)) throw new Error('Server redirects are not supported. Enter the final server address.');
      const data = await response.json();
      if (generation !== this.generation) throw new Error('Connection changed. Try again.');
      if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'The server could not complete the request.');
      return data;
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  async restore() {
    const generation = this.generation;
    const raw = await this.storage.getItem(this.metadataKey);
    if (generation !== this.generation || !raw) return;
    try {
      const saved = JSON.parse(raw) as Connection;
      const origin = canonicalOrigin(saved.origin);
      const discovery = validateDiscovery(saved.discovery, this.product);
      if (generation !== this.generation) return;
      // Restore the address only. Re-discover before credentials or API traffic.
      return { origin, discovery };
    } catch { return; }
  }
  async connect(input: string, expectedDeploymentId?: string) {
    const origin = canonicalOrigin(input);
    const previous = this.active;
    this.invalidate(); const generation = this.generation;
    if (previous) await this.persist(() => this.secure.removeItem(this.tokenKey(previous)));
    if (generation !== this.generation) throw new Error('Connection changed. Try again.');
    const discovery = validateDiscovery(await this.send(origin, '/api/mobile/discovery', {}, generation), this.product);
    if (expectedDeploymentId && discovery.deploymentId !== expectedDeploymentId) throw new Error('Server identity changed. Use Change server to reconnect and sign in again.');
    const connection = { origin, discovery };
    await this.persist(async () => {
      if (generation !== this.generation) return;
      await this.storage.setItem(this.metadataKey, JSON.stringify(connection));
    });
    if (generation !== this.generation) throw new Error('Connection changed. Try again.');
    this.active = connection; this.notify(); return connection;
  }
  async disconnect() {
    const old = this.active; this.invalidate();
    await this.persist(async () => {
      await this.storage.removeItem(this.metadataKey);
      if (old) await this.secure.removeItem(this.tokenKey(old));
    });
  }
  async request(path: string, body?: unknown) {
    const connection = this.active; const generation = this.generation;
    if (!connection) throw new Error('Connect to your organisation first.');
    return this.send(connection.origin, path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, generation);
  }
  get signedIn() { return this.token !== null; }
  /**
   * Re-attach the stored session to the *already re-discovered* connection, so
   * a returning user is not sent back to the login form on every launch.
   *
   * This runs after connect(), never instead of it: the origin has been
   * re-discovered and its deploymentId matched before any token is used, which
   * is the property restore() is careful to preserve. `verifyPath` is called
   * with the token to confirm the server still accepts it — tokens are
   * short-lived, so an expired one must land the user on the login form rather
   * than inside a broken session.
   */
  async resumeSession(verifyPath?: string) {
    const connection = this.active;
    const generation = this.generation;
    if (!connection) return false;
    let token: string | null = null;
    try { token = await this.secure.getItem(this.tokenKey(connection)); } catch { return false; }
    if (!token || generation !== this.generation) return false;
    this.token = token;
    if (verifyPath) {
      try {
        await this.send(connection.origin, verifyPath, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        }, generation);
      } catch {
        if (generation !== this.generation) return false;
        this.token = null;
        await this.persist(() => this.secure.removeItem(this.tokenKey(connection)));
        return false;
      }
    }
    if (generation !== this.generation) return false;
    this.notify();
    return true;
  }
  /** Sign out of the account but stay connected to the organisation. */
  async signOut() {
    const connection = this.active;
    this.token = null;
    this.controllers.forEach(c => c.abort());
    this.controllers.clear();
    if (connection) await this.persist(() => this.secure.removeItem(this.tokenKey(connection)));
    this.notify();
  }
  async login(email: string, password: string) {
    return this.authenticate(email, password);
  }
  async signup(email: string, password: string, firstName: string, lastName: string) {
    if (this.product !== 'patient' || !this.active?.discovery.products.some(p => p.id === 'patient' && p.registration === 'open')) throw new Error('Registration is managed by your organisation.');
    return this.authenticate(email, password, { first_name: firstName.trim(), last_name: lastName.trim() });
  }
  private async authenticate(email: string, password: string, registration?: { first_name: string; last_name: string }) {
    const connection = this.active;
    if (!connection) throw new Error('Connect to your organisation first.');
    const routes = { patient: '/api/patient/login', phlebo: '/api/phlebotomy/auth/login', crm: '/api/crm/login', 'smart-force': '/api/team/login' };
    // Do not send any previous account token to authentication endpoints.
    this.generation++; this.controllers.forEach(c => c.abort()); this.controllers.clear();
    const authGeneration = this.generation;
    this.token = null;
    const payload = { email: email.trim(), password, ...registration, ...(this.product === 'patient' ? { clinic_domain: new URL(connection.origin).hostname } : {}) };
    const result = await this.request(registration ? '/api/patient/signup' : routes[this.product], payload);
    const token = result.accessToken || result.token || result.data?.token;
    if (typeof token !== 'string' || !token) throw new Error('The server did not return a valid session.');
    await this.persist(async () => {
      if (authGeneration !== this.generation) return;
      await this.secure.setItem(this.tokenKey(connection), token);
    });
    if (authGeneration !== this.generation) throw new Error('Connection changed. Sign in again.');
    this.token = token; this.notify(); return result;
  }
}
