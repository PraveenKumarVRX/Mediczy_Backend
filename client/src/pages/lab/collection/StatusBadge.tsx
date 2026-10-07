import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRIORITY_TONE, STATUS_LABEL, statusTone } from "./format";
import type { Priority, TaskStatus } from "./types";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant="outline" className={cn("border-transparent font-medium", statusTone(status))}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "routine") return null;
  return <Badge variant="outline" className={cn("border-transparent font-semibold uppercase", PRIORITY_TONE[priority])}>{priority}</Badge>;
}
