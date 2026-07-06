import type { ReactNode } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CommandCenterShellProps {
  title: string;
  subtitle?: string;
  live?: boolean;
  alerts?: number;
  filters?: ReactNode;
  recommendations?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  loading?: boolean;
}

export default function CommandCenterShell({
  title,
  subtitle,
  live = true,
  alerts = 0,
  filters,
  recommendations,
  actions,
  children,
  loading,
}: CommandCenterShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1800px] p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-normal">{title}</h1>
              <Badge className={cn(live ? "bg-emerald-500" : "bg-slate-600", "text-white")}>
                <Activity className="h-3.5 w-3.5 mr-1" />
                {live ? "Live" : "Paused"}
              </Badge>
              {alerts > 0 && <Badge className="bg-red-500 text-white">{alerts} alerts</Badge>}
            </div>
            {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr_320px]">
          <aside className="rounded-lg border border-white/10 bg-white/5 p-3 lg:sticky lg:top-6 lg:self-start">
            {filters || <p className="text-sm text-slate-400">No filters configured.</p>}
          </aside>

          <main className="min-w-0">
            {loading ? (
              <div className="flex min-h-[420px] items-center justify-center text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading command center...
              </div>
            ) : (
              children
            )}
          </main>

          <aside className="rounded-lg border border-teal-400/20 bg-teal-400/10 p-3 lg:sticky lg:top-6 lg:self-start">
            {recommendations || <p className="text-sm text-slate-300">No AI recommendations.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
