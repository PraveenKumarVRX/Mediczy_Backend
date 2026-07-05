import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Pencil } from 'lucide-react';

export function ApprovalActionBar({
  onApprove,
  onDismiss,
  onModify,
  busy,
}: {
  onApprove?: () => void;
  onDismiss?: () => void;
  onModify?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="default" disabled={busy} onClick={onApprove}>
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
        Approve
      </Button>
      {onModify && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onModify}>
          <Pencil className="h-3.5 w-3.5 mr-1" />
          Modify
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
        <XCircle className="h-3.5 w-3.5 mr-1" />
        Dismiss
      </Button>
    </div>
  );
}
