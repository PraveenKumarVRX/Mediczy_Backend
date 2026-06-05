import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizeMap = {
    sm: { wrapper: "py-8", icon: "h-8 w-8", iconWrap: "p-3", title: "text-sm", desc: "text-xs" },
    md: { wrapper: "py-12", icon: "h-10 w-10", iconWrap: "p-4", title: "text-base", desc: "text-sm" },
    lg: { wrapper: "py-16", icon: "h-12 w-12", iconWrap: "p-5", title: "text-lg", desc: "text-sm" },
  };
  const s = sizeMap[size];

  const renderAction = (a: EmptyStateAction, primary = true) => {
    const btn = (
      <Button
        variant={a.variant ?? (primary ? "default" : "outline")}
        size="sm"
        onClick={a.onClick}
        className={primary ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}
      >
        {a.label}
      </Button>
    );
    return a.href ? <Link to={a.href}>{btn}</Link> : btn;
  };

  return (
    <div className={cn("flex flex-col items-center justify-center text-center", s.wrapper, className)}>
      <div className={cn("rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4", s.iconWrap)}>
        <Icon className={cn("text-slate-400 dark:text-slate-500", s.icon)} />
      </div>
      <h3 className={cn("font-semibold text-slate-700 dark:text-slate-200 mb-1", s.title)}>{title}</h3>
      <p className={cn("text-slate-500 dark:text-slate-400 max-w-xs mb-4", s.desc)}>{description}</p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {action && renderAction(action, true)}
          {secondaryAction && renderAction(secondaryAction, false)}
        </div>
      )}
    </div>
  );
}
