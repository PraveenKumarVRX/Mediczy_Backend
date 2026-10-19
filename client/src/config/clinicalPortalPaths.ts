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
  if (typeof window !== "undefined") {
    const visible = window.location.pathname.match(/^\/(hospital|doctor|nurse|assistant)(?:\/|$)/)?.[1];
    if (visible) return visible as ClinicalPortal;
  }
  return PORTAL_BY_USER_TYPE[getUserType() || ""] || "hospital";
}

export function clinicalBase(portal: ClinicalPortal = getClinicalPortal()): string {
  return `/${portal}`;
}

/**
<<<<<<< HEAD
 * Routes that portalClinicalRoutes.tsx's HOSPITAL_ONLY list keeps mounted under
 * /hospital/* whatever the active portal is. Paths built from the generic portal
 * base 404 for any non-hospital portal. Keep in sync with HOSPITAL_ONLY there.
=======
 * Routes that portalClinicalRoutes.tsx's HOSPITAL_ONLY list keeps mounted
 * under /hospital/* regardless of the active portal — /doctor/command-center
 * etc. simply don't exist, so paths built with the generic portal ${base}
 * 404. Kept in sync manually since HOSPITAL_ONLY isn't exported from there.
>>>>>>> recover/care-intelligence-mesh
 */
const HOSPITAL_ONLY_BASE = "/hospital";

/** HealthOS + inpatient paths for a portal prefix */
export function buildClinicalPaths(portal: ClinicalPortal = getClinicalPortal()) {
  const base = clinicalBase(portal);
  return {
    portal,
    base,
    healthosHub: `${base}/healthos`,
    careosHub: `${base}/careos`,
    commandCenter: `${HOSPITAL_ONLY_BASE}/command-center`,
    copilot: `${base}/copilot`,
    patientHealthos: (patientId: string | number) => `${base}/patient/${patientId}/healthos`,
    patientAiTeam: (patientId: string | number) => `${base}/patient/${patientId}/healthos/ai-team`,
    patientCareos: (patientId: string | number) => `${base}/patient/${patientId}/careos`,
    patientWorkspace: (patientId: string | number) => `${base}/patient/${patientId}/workspace`,
    globalBoard: (patientId: string | number) => `${base}/healthos/board/${patientId}`,
    passport: (patientId: string | number) => `${base}/healthos/passport/${patientId}`,
    bedsMap: `${HOSPITAL_ONLY_BASE}/beds/map`,
<<<<<<< HEAD
    emar: `${portal === "nurse" ? base : HOSPITAL_ONLY_BASE}/emar`,
    echart: `${portal === "nurse" ? base : HOSPITAL_ONLY_BASE}/echart`,
=======
    emar: `${HOSPITAL_ONLY_BASE}/emar`,
    echart: `${base}/echart`,
>>>>>>> recover/care-intelligence-mesh
    aiOps: `${HOSPITAL_ONLY_BASE}/ai-ops`,
  };
}

/**
 * Map legacy /hmis/* URLs to portal-native paths.
 * Operational HMIS screens stay on /hospital/*; collaborative HealthOS screens follow the active login portal.
 */
export function resolveHmisLegacyPath(pathname: string): string {
  const suffix = pathname.replace(/^\/hmis/, "") || "/";
  const portal = getClinicalPortal();

  if (portal === "nurse" && /^\/(emar|echart|admission\/[^/]+\/(echart|nursing-tasks))(\/|$)/.test(suffix)) return `/nurse${suffix}`;

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
