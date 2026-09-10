import { Link } from 'react-router-dom';
import { RefreshCw, Info, type LucideIcon } from 'lucide-react';

// Canonical Shell/Metric/Empty/Notice, extracted from the most complete set of
// these (previously duplicated with inconsistent prop shapes across the
// Hospital*.tsx pages). New pages should import from here; existing pages
// keep their local copies untouched.

const toneClasses: Record<string, string> = {
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
  cyan: 'text-cyan-300',
  violet: 'text-violet-300',
  slate: 'text-slate-300',
};

export function Shell({
  title, eyebrow, description, children, onRefresh, loading,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{eyebrow}</p>}
          <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
          {description && <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function Metric({
  icon: Icon, label, value, hint, tone = 'slate',
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${toneClasses[tone] || toneClasses.slate}`} />
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Notice({ message, tone = 'error' }: { message: string; tone?: 'error' | 'success' }) {
  const cls = tone === 'success'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
    : 'border-red-400/20 bg-red-400/10 text-red-100';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{message}</div>;
}

/**
 * A "this hasn't been set up yet" banner — used instead of a wall of zero
 * tiles when a dashboard's payload is entirely empty for the tenant.
 */
export function NotConfiguredBanner({
  title, hint, ctaLabel, ctaTo,
}: {
  title: string;
  hint: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
        <div>
          <p className="text-sm font-semibold text-amber-100">{title}</p>
          <p className="mt-0.5 text-xs text-amber-200/70">{hint}</p>
        </div>
      </div>
      {ctaLabel && ctaTo && (
        <Link
          to={ctaTo}
          className="flex-shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-400/20"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * A horizontal stage-by-stage funnel bar chart, generalized from the RFQ
 * conversion funnel on the main CRM dashboard so it can render any funnel
 * (lead → contacted → appointment → visit → revenue, etc.) from one shared
 * component instead of a hand-rolled table per page.
 */
export function FunnelBar({ stages }: { stages: { label: string; value: number; sub?: string }[] }) {
  const total = Math.max(...stages.map((s) => s.value), 1);
  const palette = [
    { color: 'from-blue-600 to-blue-500', text: 'text-blue-300' },
    { color: 'from-cyan-600 to-cyan-500', text: 'text-cyan-300' },
    { color: 'from-violet-600 to-violet-500', text: 'text-violet-300' },
    { color: 'from-amber-600 to-amber-500', text: 'text-amber-300' },
    { color: 'from-orange-600 to-orange-500', text: 'text-orange-300' },
    { color: 'from-emerald-600 to-emerald-500', text: 'text-emerald-300' },
  ];
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {stages.map((stage, i) => {
        const pct = total > 0 ? Math.round((stage.value / total) * 100) : 0;
        const barH = Math.max(pct, 6);
        const { color, text } = palette[i % palette.length];
        return (
          <div key={stage.label} className="flex flex-col items-center gap-2">
            <div className="relative flex h-24 w-full flex-col items-center justify-end overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.02]">
              <div
                className={`flex w-full items-end justify-center bg-gradient-to-t pb-1.5 transition-all duration-700 ${color}`}
                style={{ height: `${Math.min(barH, 100)}%` }}
              >
                <span className="text-xs font-bold text-white">{stage.value}</span>
              </div>
            </div>
            <div className="text-center">
              <p className={`text-xs font-semibold ${text}`}>{stage.label}</p>
              {stage.sub && <p className="text-[9px] text-slate-600">{stage.sub}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
