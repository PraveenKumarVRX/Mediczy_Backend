import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(HERE, file), 'utf8');

const declaration = (source, method, path) => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`router\\.${method}\\(\\s*['"]${escaped}['"][\\s\\S]{0,420}?\\n`).test(source);
};

describe('high-risk clinical writes use the HRMS qualification decision', () => {
  it('pharmacy dispense is privilege-gated after authentication and role checks', () => {
    const source = read('routes/pharmacy-dispense.route.js');
    expect(source).toContain("requireStaffPrivilege('dispense_medication')");
    expect(declaration(source, 'post', '/:id/dispense')).toBe(true);
  });

  it('blood-bank issue, cross-match, and transfusion writes are privilege-gated', () => {
    const source = read('routes/dept/bloodBank.route.js');
    for (const [path, privilege] of [
      ['/requisitions/:id/issue', 'blood_issue'],
      ['/requisitions/:id/cross-match', 'blood_crossmatch'],
      ['/cross-match', 'blood_crossmatch'],
      ['/transfusions', 'transfusion_record'],
    ]) {
      expect(source).toContain(`requireStaffPrivilege('${privilege}')`);
      expect(declaration(source, 'post', path)).toBe(true);
    }
  });

  it('blood-bank claims are normalized into the shared tenant/staff context', () => {
    const source = read('middleware/hrms-privilege.middleware.js');
    expect(source).toContain('req.bloodBankUser');
    expect(source).toContain('req.bloodBankOrgId');
    expect(source).toContain("'blood_bank'");
  });
});
