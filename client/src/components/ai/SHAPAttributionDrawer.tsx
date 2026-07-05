import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2 } from 'lucide-react';
import RiskScoreExplanation from '@/components/ai/RiskScoreExplanation';

interface SHAPAttributionDrawerProps {
  patientId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** SHAP explainability drawer for AI Care Team (SaMD) */
export function SHAPAttributionDrawer({ patientId, open, onOpenChange }: SHAPAttributionDrawerProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (open) setReady(true);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>AI Explainability (SHAP)</SheetTitle>
        </SheetHeader>
        {ready ? (
          <div className="mt-4">
            <RiskScoreExplanation patientId={patientId} mode="doctor" />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading attribution…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
