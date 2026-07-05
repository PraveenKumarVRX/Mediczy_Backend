import { getUserType } from "@/hooks/auth";

export type ClinicalPortal = "hospital" | "doctor" | "nurse" | "assistant";

const PORTAL_BY_USER_TYPE: Record<string, ClinicalPortal> = {
  hospital: "hospital",
  doctor: "doctor",
  nurse: "nurse",
  assistant: "assistant",
  admin: "hospital",
  team: "hospital",
};

/** Active clinical portal prefix for deep links and navigation */
export function getClinicalPortal(): ClinicalPortal {
  return PORTAL_BY_USER_TYPE[getUserType() || ""] || "hospital";
}

export function clinicalBase(portal: ClinicalPortal = getClinicalPortal()): string {
  return `/${portal}`;
}

/** HealthOS + inpatient paths for a portal prefix */
export function buildClinicalPaths(portal: ClinicalPortal = getClinicalPortal()) {
  const base = clinicalBase(portal);
  return {
    portal,
    base,
    healthosHub: `${base}/healthos`,
    careosHub: `${base}/careos`,
    commandCenter: `${base}/command-center`,
    copilot: `${base}/copilot`,
    patientHealthos: (patientId: string | number) => `${base}/patient/${patientId}/healthos`,
    patientCareos: (patientId: string | number) => `${base}/patient/${patientId}/careos`,
    patientWorkspace: (patientId: string | number) => `${base}/patient/${patientId}/workspace`,
    globalBoard: (patientId: string | number) => `${base}/healthos/board/${patientId}`,
    passport: (patientId: string | number) => `${base}/healthos/passport/${patientId}`,
    bedsMap: `${base}/beds/map`,
    emar: `${base}/emar`,
    echart: `${base}/echart`,
    aiOps: `${base}/ai-ops`,
  };
}

/**
 * Map legacy /hmis/* URLs to portal-native paths.
 * Operational HMIS screens stay on /hospital/*; collaborative HealthOS screens follow the active login portal.
 */
export function resolveHmisLegacyPath(pathname: string): string {
  const suffix = pathname.replace(/^\/hmis/, "") || "/";
  const portal = getClinicalPortal();

  const hospitalOnly =
    /^\/(command-center|beds\/|ot\/|emar|discharge-board|report-center|hl7-fhir|ai-|predictive-analytics|admission\/|echart|calculators|reference|hospital-copilot)(\/?|$)/.test(
      suffix
    );

  if (hospitalOnly) {
    return `/hospital${suffix}`.replace("/hospital/hospital-copilot", "/hospital/copilot");
  }

  if (portal === "hospital") {
    return `/hospital${suffix}`;
  }

  // HealthOS hub, patient workspace, board, passport → doctor / nurse / assistant portal
  return `/${portal}${suffix}`;
}

/** Login path for the active clinical portal */
export function clinicalLoginPath(portal: ClinicalPortal = getClinicalPortal()): string {
  return `${clinicalBase(portal)}/login`;
}
