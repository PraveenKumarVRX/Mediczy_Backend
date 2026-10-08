import { describe, expect, it } from "vitest";
import { buildClinicalPaths } from "./clinicalPortalPaths";

// portalClinicalRoutes.tsx mounts HOSPITAL_ONLY routes under /hospital/* only.
describe("buildClinicalPaths", () => {
  it.each(["doctor", "nurse", "assistant", "hospital"] as const)(
    "points hospital-only screens at /hospital for the %s portal",
    (portal) => {
      const p = buildClinicalPaths(portal);
      expect(p.commandCenter).toBe("/hospital/command-center");
      expect(p.bedsMap).toBe("/hospital/beds/map");
      expect(p.emar).toBe("/hospital/emar");
      expect(p.echart).toBe("/hospital/echart");
      expect(p.aiOps).toBe("/hospital/ai-ops");
    }
  );

  it("keeps shared HealthOS screens on the active portal", () => {
    expect(buildClinicalPaths("doctor").healthosHub).toBe("/doctor/healthos");
    expect(buildClinicalPaths("nurse").copilot).toBe("/nurse/copilot");
  });
});
