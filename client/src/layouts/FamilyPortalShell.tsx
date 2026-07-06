import type { ReactNode } from "react";
import { HeartHandshake, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface FamilyPortalShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function FamilyPortalShell({
  title,
  subtitle,
  actions,
  children,
}: FamilyPortalShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-5 md:py-8 space-y-5">
        <header className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-teal-600 p-2 text-white">
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
              </div>
              {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
          </div>

          <div className="rounded-lg border border-teal-200 bg-white p-3 text-sm text-slate-700 shadow-sm">
            <Badge variant="secondary" className="mr-2 bg-teal-100 text-teal-800">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Consent gated
            </Badge>
            You only see updates approved by the care team.
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
