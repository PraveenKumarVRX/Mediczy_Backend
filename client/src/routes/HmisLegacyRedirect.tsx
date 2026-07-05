import { Navigate, useLocation } from "react-router-dom";
import { resolveHmisLegacyPath } from "@/config/clinicalPortalPaths";

/** Redirects deprecated /hmis/* URLs to /hospital/*, /doctor/*, or /nurse/* based on session */
export default function HmisLegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  const target = resolveHmisLegacyPath(pathname);
  return <Navigate to={`${target}${search}${hash}`} replace />;
}
