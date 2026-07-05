import { getCapabilitiesMeta } from '../services/hospital-os/hospital-os.constants.js';

describe('Hospital OS constants', () => {
  it('defines 14+ pillars', () => {
    const caps = getCapabilitiesMeta();
    expect(caps.pillars.length).toBeGreaterThanOrEqual(14);
    expect(caps.pillars).toContain('unified_copilot');
    expect(caps.version).toBe('1.0.0');
  });
});
