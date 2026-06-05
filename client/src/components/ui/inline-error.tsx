import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineErrorProps {
  message?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function InlineError({
  message = "Something went wrong.",
  description = "Check your connection and try again.",
  onRetry,
  className,
  compact = false,
}: InlineErrorProps) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-red-600 dark:text-red-400", className)}>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto text-xs underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 p-4",
      className
    )}>
      <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 shrink-0">
        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{message}</p>
        {description && (
          <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="shrink-0 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 h-7 px-2 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Try again
        </Button>
      )}
    </div>
  );
}
