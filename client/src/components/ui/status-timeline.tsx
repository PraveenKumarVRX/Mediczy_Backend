import { CheckCircle, Clock, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "completed" | "active" | "pending" | "failed";

interface TimelineStep {
  label: string;
  description?: string;
  date?: string;
  status: StepStatus;
}

interface StatusTimelineProps {
  steps: TimelineStep[];
  className?: string;
}

const iconMap: Record<StepStatus, React.ReactNode> = {
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  active:    <Clock className="h-4 w-4 text-teal-500 animate-pulse" />,
  pending:   <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />,
  failed:    <XCircle className="h-4 w-4 text-red-500" />,
};

const lineColorMap: Record<StepStatus, string> = {
  completed: "bg-green-400",
  active:    "bg-teal-400",
  pending:   "bg-slate-200 dark:bg-slate-700",
  failed:    "bg-red-400",
};

export function StatusTimeline({ steps, className }: StatusTimelineProps) {
  return (
    <ol className={cn("space-y-0", className)} aria-label="Status timeline">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li key={i} className="flex gap-3">
            {/* Icon + connector */}
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shrink-0 z-10">
                {iconMap[step.status]}
              </div>
              {!isLast && (
                <div className={cn("w-0.5 flex-1 mt-1 mb-1 rounded-full min-h-[1.5rem]", lineColorMap[step.status])} />
              )}
            </div>

            {/* Content */}
            <div className={cn("pb-5 min-w-0", isLast && "pb-0")}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className={cn(
                  "text-sm font-medium",
                  step.status === "active" ? "text-teal-700 dark:text-teal-300" :
                  step.status === "completed" ? "text-slate-700 dark:text-slate-300" :
                  step.status === "failed" ? "text-red-600 dark:text-red-400" :
                  "text-slate-400 dark:text-slate-500"
                )}>
                  {step.label}
                </p>
                {step.date && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">{step.date}</span>
                )}
              </div>
              {step.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
