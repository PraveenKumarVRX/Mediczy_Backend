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

export const APP_SPEC_VERSION = '1.1.0';

export function buildAppSpec() {
  return JSON.parse(JSON.stringify({
    openapi: '3.0.3',
    info: {
      title: 'My SmartHealth app API (Mediqzy)',
      version: APP_SPEC_VERSION,
      description: [
        'The contract the My SmartHealth mobile app and partners build against.',
        'Authentication is a bearer JWT from sign-in. Every endpoint acts only for the caller; none takes a user, member or corporate id that would let one caller act for another.',
        'Errors carry `success: false` and a `message`; integration and SmartCRM errors add a stable `code` to branch on.',
        'Scope: /api/employee (corporate employee, policy wallet, SmartCRM link and enrolment), /api/addresses lookup, the social sign-in hand-off, and admin integration status. Other endpoints are not yet part of the contract.',
      ].join('\n\n'),
    },
    servers: [{ url: '/', description: 'Same origin as the app backend' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Employee' }, { name: 'Employee network' }, { name: 'Benefits' }, { name: 'Policy wallet' },
      { name: 'Claims' }, { name: 'Insurance (SmartCRM)' }, { name: 'Addresses' }, { name: 'Sign-in' }, { name: 'Admin' },
    ],
    paths,
    components: { schemas, securitySchemes, responses },
  }));
}

export default buildAppSpec;
