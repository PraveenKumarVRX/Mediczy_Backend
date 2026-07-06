/**
 * Single source of truth for the HealthOS nav cluster that used to be
 * hand-duplicated (and drift) across HospitalSidebar.tsx and
 * MainLayoutdoctor.tsx — see the /doctor/command-center 404 fixed earlier
 * this exact way. Scoped deliberately narrow: only the three destinations
 * that both hospital and doctor navs need to agree on (Living Workspace hub,
 * Command Center, Hospital Copilot). Ward/department links (Bed Map, ICU
 * Board, etc.) already live correctly in HospitalSidebar's hospital-only
 * arrays and aren't duplicated here — pulling them into a portal-aware
 * config with no doctor/nurse equivalent would just add risk for no
 * unification benefit.
 *
 * Every href below points at a route verified to exist in routes/index.tsx
 * or portalClinicalRoutes.tsx.
 */
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Network, Sparkles } from "lucide-react";

export type ClinicalNavPortal = "hospital" | "doctor" | "nurse";

export interface ClinicalNavItem {
  id: string;
  label: string;
  /** Hospital-only surfaces always resolve under /hospital regardless of
   *  the active portal (see clinicalPortalPaths.ts's HOSPITAL_ONLY_BASE) —
   *  set hospitalOnly to reuse that same fixed base instead of duplicating
   *  the path per portal. */
  hospitalOnly?: boolean;
  /** Path segment after the portal base, e.g. "command-center" */
  path: string;
  icon: LucideIcon;
  portals: ClinicalNavPortal[];
}

export const HEALTHOS_NAV_ITEMS: ClinicalNavItem[] = [
  {
    id: "healthos-hub",
    label: "HealthOS",
    path: "healthos",
    icon: Network,
    portals: ["hospital", "doctor", "nurse"],
  },
  {
    id: "command-center",
    label: "Command Center",
    hospitalOnly: true,
    path: "command-center",
    icon: LayoutDashboard,
    portals: ["hospital", "doctor", "nurse"],
  },
  {
    id: "copilot",
    label: "Hospital Copilot",
    path: "copilot",
    icon: Sparkles,
    portals: ["hospital", "doctor", "nurse"],
  },
];

/** Resolve an item's href for a given active portal. */
export function clinicalNavHref(item: ClinicalNavItem, portal: ClinicalNavPortal): string {
  const base = item.hospitalOnly ? "/hospital" : `/${portal}`;
  return `${base}/${item.path}`;
}

/** HealthOS nav items visible to a given portal. */
export function getHealthOsNavForPortal(portal: ClinicalNavPortal): ClinicalNavItem[] {
  return HEALTHOS_NAV_ITEMS.filter((item) => item.portals.includes(portal));
}
