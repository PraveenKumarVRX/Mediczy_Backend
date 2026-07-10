import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Ticket } from 'lucide-react';
import {
  buildPreviewHeadline,
  COUPON_CATEGORIES,
  type CouponFormState,
} from './couponConfig';

type CouponPreviewCardProps = {
  form: CouponFormState;
  compact?: boolean;
};

export function CouponPreviewCard({ form, compact = false }: CouponPreviewCardProps) {
  const category = COUPON_CATEGORIES[form.category];
  const code = form.code.trim().toUpperCase() || 'YOURCODE';
  const headline = buildPreviewHeadline(form);

  return (
    <Card className="overflow-hidden border-2 border-dashed border-primary/25 bg-gradient-to-br from-primary/5 via-background to-background shadow-none">
      <CardContent className={compact ? 'p-4' : 'p-6'}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Patient preview
            </p>
            <p className={`font-semibold leading-tight ${compact ? 'text-base' : 'text-lg'}`}>
              {headline}
            </p>
          </div>
          <div className="rounded-full bg-primary/10 p-2">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
        </div>

        <div className="mt-4 rounded-xl border bg-background/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xl font-bold tracking-wide text-primary">{code}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {category.label}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {form.description || category.example}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="font-medium text-foreground">Redemptions</p>
            <p>
              {form.maxUsagePerUser || '1'}× per user · {form.maxUsage || '∞'} total
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="font-medium text-foreground">Audience</p>
            <p>{form.audience === 'specific' ? 'Selected users only' : 'All eligible patients'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
