import { type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/ui/inline-error";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataStateProps<T> {
  /** A real fetch is in flight and there is no data to show yet. */
  loading: boolean;
  /** The real fetch failed. Anything truthy counts — pass the caught error or just `true`. */
  error?: unknown;
  /** The real API response, once it exists. */
  data: T | null | undefined;
  /** True when the fetch succeeded but returned nothing. Defaults to checking `data` for
   * null/undefined/an empty array — pass this explicitly when "empty" means something else
   * (e.g. a zero count on an object). */
  isEmpty?: boolean;
  onRetry?: () => void;
  errorMessage?: string;
  errorDescription?: string;
  /** Required, not defaulted — the plan (WP-0.3a) is specifically about screens presenting nothing-
   * yet as if it were real data; a shared generic "No data" message defeats that, so every screen
   * must say what "empty" actually means here. */
  emptyState: ReactNode;
  /** Custom loading UI. Defaults to three skeleton rows. */
  loadingState?: ReactNode;
  /** When the live data was last fetched. If older than `staleAfterMs` (default 5 minutes), a small
   * "data may be stale" marker renders above the content — see WP-0.3d (ICUBoardDisplay.tsx) for why:
   * a board that silently swallows a refresh failure and keeps showing an old snapshot must say so. */
  staleSince?: string | number | Date | null;
  staleAfterMs?: number;
  className?: string;
  /** Render prop for the live state, so DataState can pass the narrowed (non-null) data through. */
  children: (data: T) => ReactNode;
}

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;

function isStale(staleSince: DataStateProps<unknown>["staleSince"], staleAfterMs: number): boolean {
  if (!staleSince) return false;
  const ts = staleSince instanceof Date ? staleSince.getTime() : new Date(staleSince).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts > staleAfterMs;
}

/**
 * Renders exactly one of the five states a query result can be in, so a screen consuming it cannot
 * accidentally skip straight to rendering fabricated or stale-looking data (see
 * docs/WP0.3_INVENTED_DATA_INVENTORY.md for the framework this implements: Live, Loading, Empty,
 * Error, and — the one this exists to prevent — Invented shown indistinguishably from Live).
 *
 * Precedence: loading (no data yet) > error (no data yet) > empty > live. A loading or error state
 * that occurs while *stale data is already on screen* falls through to live + the stale marker,
 * rather than yanking away content the user was already looking at.
 */
export function DataState<T>({
  loading,
  error,
  data,
  isEmpty,
  onRetry,
  errorMessage,
  errorDescription,
  emptyState,
  loadingState,
  staleSince,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  className,
  children,
}: DataStateProps<T>) {
  const hasData = data !== null && data !== undefined && !(Array.isArray(data) && data.length === 0);

  if (loading && !hasData) {
    return (
      <div className={cn("space-y-2", className)}>
        {loadingState ?? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        )}
      </div>
    );
  }

  if (error && !hasData) {
    return (
      <div className={className}>
        <InlineError message={errorMessage} description={errorDescription} onRetry={onRetry} />
      </div>
    );
  }

  const empty = isEmpty ?? !hasData;
  if (empty) {
    return <div className={className}>{emptyState}</div>;
  }

  const stale = isStale(staleSince, staleAfterMs);
  return (
    <div className={className}>
      {stale && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 mb-2">
          <Clock className="h-3.5 w-3.5" />
          Data may be stale — last updated {new Date(staleSince as string | number | Date).toLocaleTimeString()}
        </div>
      )}
      {children(data as T)}
    </div>
  );
}
