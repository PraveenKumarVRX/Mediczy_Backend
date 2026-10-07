import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { toProblem } from "./format";

/** One place that turns an API failure into a message a dispatcher can act on. */
export function useProblemToast() {
  const { toast } = useToast();
  return useCallback((err: unknown, fallbackTitle = "Action failed") => {
    const p = toProblem(err);
    const stale = p.code === "version_conflict" || p.code === "assignment_changed";
    toast({
      variant: "destructive",
      title: stale ? "This task changed" : fallbackTitle,
      description: stale ? "Someone else updated it, so it has been reloaded. Review it and try again." : p.message,
    });
    return p;
  }, [toast]);
}
