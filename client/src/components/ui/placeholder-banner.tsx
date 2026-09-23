import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaceholderBannerProps {
  reason: string;
  title?: string;
  className?: string;
}

/** Honest label for a screen (or a section of one) that cannot show real data yet — no backend
 * exists, or a specific measure has no data source. WP-0.3a: extracted from the one-off version this
 * pattern started as in AmbulanceDashboard.tsx so every screen that needs it uses the same component
 * instead of a copy-pasted div, which is how "invented data with no visible label" bugs crept in
 * elsewhere in the first place. */
export function PlaceholderBanner({ reason, title = "Sample data.", className }: PlaceholderBannerProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-4",
        className
      )}
    >
      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <span className="text-amber-800 dark:text-amber-200">
        <strong>{title}</strong> {reason}
      </span>
    </div>
  );
}
