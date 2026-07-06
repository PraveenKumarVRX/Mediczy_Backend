/**
 * ClinicalShell — the shared frame for patient-centric clinical pages.
 *
 * This is a composition shell, not a state owner: it renders the patient
 * context header and a two-column frame (rail + content), but the caller
 * still owns tab state. Pass a Radix <Tabs> from the page, put the
 * <TabsList> in `rail` and the <TabsContent> blocks in `children` — both
 * stay inside the same <Tabs> provider, so switching works exactly as it
 * did before the page was wrapped in a shell. Deliberately not owning the
 * tab logic here: extracting each tab into its own route is separate,
 * larger work (Phase 1 of the frontend plan), not part of this pass.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClinicalShellProps {
  /** Route to navigate back to, or an onClick handler for browser back */
  onBack: string | (() => void);
  title: string;
  subtitle?: string;
  /** e.g. a brand badge, an acuity chip — kept as a slot, not a prescribed shape */
  badges?: ReactNode;
  /** Quick actions — Video call, Start MDT, etc. */
  actions?: ReactNode;
  /** The section switcher — typically a <TabsList> from the caller's <Tabs> */
  rail: ReactNode;
  /** The active section's content — typically <TabsContent> blocks */
  children: ReactNode;
  /** Inline error/notice banner, shown between header and body */
  banner?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
}

export function ClinicalShell({
  onBack,
  title,
  subtitle,
  badges,
  actions,
  rail,
  children,
  banner,
  loading,
  loadingLabel = "Loading…",
}: ClinicalShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {/* Patient context header — always visible, independent of active section */}
        <div className="flex flex-wrap items-center gap-3">
          {typeof onBack === "string" ? (
            <Button variant="ghost" size="icon" asChild>
              <Link to={onBack}><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          )}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800">{title}</h1>
              {badges}
            </div>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
        </div>

        {banner}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> {loadingLabel}
          </div>
        ) : (
          <div className={cn("grid gap-4", "md:grid-cols-[220px_1fr]")}>
            <div className="md:sticky md:top-6 md:self-start">{rail}</div>
            <div className="min-w-0">{children}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClinicalShell;
