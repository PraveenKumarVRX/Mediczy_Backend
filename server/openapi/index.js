/**
 * The app-facing API contract (OpenAPI 3.0.3) — the source of truth for what
 * the My SmartHealth app, partners (SmartCRM, TPAs) and our own tests may
 * rely on. docs/architecture/API_CONTRACT_AND_INTEGRATIONS.md explains the rules.
 *
 *   buildAppSpec()        the spec object (fresh copy each call)
 *   served at             GET /api/admin/openapi/app.json, UI at /api/admin/openapi/docs
 *   exported artifact     server/openapi/dist/app.openapi.json
 *                         (npm run openapi:export — CI fails if it drifts)
 *
 * Versioning: bump info.version on any change the app can notice. A removed
 * field, a retyped field or a new required request field is MAJOR; a new
 * endpoint or optional field is MINOR.
 */
import { schemas, securitySchemes, responses } from './components.js';
import { paths } from './paths.js';
import { mobilePaths, mobileSchemas, mobileResponses } from './mobile.js';

export const APP_SPEC_VERSION = '1.4.0';

export function buildAppSpec() {
  return JSON.parse(JSON.stringify({
    openapi: '3.0.3',
    info: {
      title: 'My SmartHealth app API (Mediqzy)',
      version: APP_SPEC_VERSION,
      description: [
        'The contract the My SmartHealth mobile app and partners build against.',
        'Authentication uses a bearer JWT from sign-in. Patient endpoints enforce ownership; provider and admin endpoints additionally enforce their roles and tenant scope. Refresh and revocation endpoints accept refresh credentials rather than a bearer token.',
        'Error envelopes vary by endpoint; many carry `success: false` and `message`. Integration and SmartCRM errors add a stable `code` to branch on.',
        'Scope: employee benefits and insurance, addresses, sign-in and session rotation, appointments, lab booking/cart/history, pharmacy and pharmacy orders, billing/payments, membership, and admin integration status.',
      ].join('\n\n'),
    },
    servers: [{ url: '/', description: 'Same origin as the app backend' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Employee' }, { name: 'Employee network' }, { name: 'Benefits' }, { name: 'Policy wallet' },
      { name: 'Claims' }, { name: 'Insurance (SmartCRM)' }, { name: 'Addresses' }, { name: 'Sign-in' }, { name: 'Admin' },
      ...['Account and sign-in', 'Appointments', 'Labs', 'Lab orders', 'Pharmacy', 'Pharmacy orders', 'Billing', 'Payments', 'Membership'].map(name => ({ name })),
    ],
    paths: { ...paths, ...mobilePaths },
    components: { schemas: { ...schemas, ...mobileSchemas }, securitySchemes, responses: { ...responses, ...mobileResponses } },
  }));
}

export default buildAppSpec;
