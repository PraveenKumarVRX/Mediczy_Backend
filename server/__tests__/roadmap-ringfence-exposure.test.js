/**
 * roadmap-intelligence exposure is deliberate and narrow: only operational analytics sub-routes are reachable (for
 * platform/hospital admins). Clinical decision-support / consent sub-routes stay OFF until a SaMD classification and
 * clinical validation approve them.
 */
import { USER_TYPE_PERMISSIONS } from '../middleware/ringFencing.js';

const ANALYTICS = ['staffing', 'rwe', 'esg', 'antibiogram', 'infection-surveillance'].map((x) => `/api/roadmap-intelligence/${x}`);
const CLINICAL = ['pgx', 'voice-biometrics', 'ar-surgical-plans', 'trials', 'sdoh', 'wounds', 'revenue-cycle', 'smart-room'];
const reach = (type, path) => (USER_TYPE_PERMISSIONS[type]?.allowedPaths || []).some((a) => path === a || path.startsWith(`${a}/`));

describe('ring-fence exposure of /api/roadmap-intelligence', () => {
  it.each(['admin', 'hospital'])('%s can reach the analytics sub-routes', (type) => {
    for (const p of ANALYTICS) expect(reach(type, `${p}/anything`) || reach(type, p)).toBe(true);
  });
  it('no user type can reach a clinical decision-support / consent sub-route', () => {
    for (const type of Object.keys(USER_TYPE_PERMISSIONS)) for (const c of CLINICAL) {
      expect(reach(type, `/api/roadmap-intelligence/${c}`)).toBe(false);
    }
  });
  it('nobody is granted the whole router by a broad prefix (patients, doctors, nurses…)', () => {
    for (const [type, cfg] of Object.entries(USER_TYPE_PERMISSIONS)) {
      expect((cfg.allowedPaths || []).filter((a) => a === '/api/roadmap-intelligence' || a === '/api/roadmap-intelligence/')).toEqual([]);
    }
    for (const type of ['patient', 'user', 'doctor', 'nurse', 'lab', 'pharmacy']) {
      for (const p of ANALYTICS) expect(reach(type, p)).toBe(false);
    }
  });
});
