import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Coins,
  Crown,
  Loader2,
  Pill,
  Scan,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { CouponPreviewCard } from './CouponPreviewCard';
import {
  addDaysToDateInput,
  categoryFromCoupon,
  COUPON_CATEGORIES,
  COUPON_GROUPS,
  DEFAULT_FORM,
  PROMO_TEMPLATES,
  type CouponCategory,
  type CouponFormState,
  type CouponGroupId,
} from './couponConfig';

const GROUP_ICONS = {
  coins: Coins,
  membership: Crown,
  pharmacy: Pill,
  diagnostics: Scan,
} as const;

const GROUP_ACCENT: Record<CouponGroupId, string> = {
  coins: 'border-amber-500/40 ring-amber-500/20 bg-amber-500/5',
  membership: 'border-rose-500/40 ring-rose-500/20 bg-rose-500/5',
  pharmacy: 'border-cyan-500/40 ring-cyan-500/20 bg-cyan-500/5',
  diagnostics: 'border-teal-500/40 ring-teal-500/20 bg-teal-500/5',
};

type CouponFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CouponFormState;
  setFormData: React.Dispatch<React.SetStateAction<CouponFormState>>;
  editingCoupon: any | null;
  onSubmit: (event: React.FormEvent) => void;
  isSubmitting: boolean;
  onReset: () => void;
};

export function CouponFormSheet({
  open,
  onOpenChange,
  formData,
  setFormData,
  editingCoupon,
  onSubmit,
  isSubmitting,
  onReset,
}: CouponFormSheetProps) {
  const [activeGroup, setActiveGroup] = useState<CouponGroupId>('pharmacy');
  const selectedCategory = COUPON_CATEGORIES[formData.category];
  const isMembership = formData.category === 'MEMBERSHIP' || formData.category === 'MEMBERSHIP_FREE';

  const categoriesInGroup = useMemo(
    () =>
      (Object.entries(COUPON_CATEGORIES) as [CouponCategory, (typeof COUPON_CATEGORIES)[CouponCategory]][])
        .filter(([, config]) => config.group === activeGroup)
        .map(([key, config]) => ({ key, ...config })),
    [activeGroup]
  );

  const applyTemplate = (templateId: string) => {
    const template = PROMO_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;

    setActiveGroup(template.group);
    setFormData((prev) => ({
      ...prev,
      ...template.patch,
      validUntil: prev.validUntil || addDaysToDateInput(365),
      corporateName: prev.corporateName || 'Mediqzy',
    }));
  };

  const selectCategory = (category: CouponCategory) => {
    const config = COUPON_CATEGORIES[category];
    setFormData((prev) => ({
      ...prev,
      category,
      minPurchase: config.showMinPurchase ? prev.minPurchase : '0',
    }));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) onReset();
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="h-5 w-5 text-primary" />
            {editingCoupon ? 'Edit promotion' : 'Create promotion'}
          </SheetTitle>
          <SheetDescription>
            Design a patient-facing offer for wallet, membership, pharmacy, or imaging bookings.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 space-y-8 pb-8">
          {!editingCoupon && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Quick start templates</Label>
                <span className="text-xs text-muted-foreground">One tap fills the form</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PROMO_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id)}
                    className="rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <p className="font-medium">{template.name}</p>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <section className="space-y-3">
                <Label className="text-sm font-semibold">1. What are you promoting?</Label>
                <Tabs value={activeGroup} onValueChange={(value) => setActiveGroup(value as CouponGroupId)}>
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/50 p-1 lg:grid-cols-4">
                    {COUPON_GROUPS.map((group) => {
                      const Icon = GROUP_ICONS[group.id];
                      return (
                        <TabsTrigger key={group.id} value={group.id} className="flex flex-col gap-1 py-2 text-xs">
                          <Icon className="h-4 w-4" />
                          {group.label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                  {COUPON_GROUPS.map((group) => (
                    <TabsContent key={group.id} value={group.id} className="mt-3">
                      <p className="mb-3 text-sm text-muted-foreground">{group.description}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {categoriesInGroup.map((item) => {
                          const selected = formData.category === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => selectCategory(item.key)}
                              className={cn(
                                'rounded-xl border p-3 text-left transition',
                                selected
                                  ? cn('ring-2', GROUP_ACCENT[group.id])
                                  : 'hover:border-primary/30 hover:bg-muted/40'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium">{item.label}</p>
                                {selected && <Badge variant="secondary">Selected</Badge>}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{item.example}</p>
                            </button>
                          );
                        })}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </section>

              <section className="space-y-4 rounded-xl border bg-card p-4">
                <Label className="text-sm font-semibold">2. Offer details</Label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-code">Promo code</Label>
                    <Input
                      id="coupon-code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="MED500"
                      required
                      disabled={Boolean(editingCoupon && editingCoupon.usageCount > 0)}
                      className="font-mono uppercase"
                    />
                    <p className="text-xs text-muted-foreground">Short, memorable, uppercase — what patients type at checkout.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-value">{selectedCategory.valueLabel}</Label>
                    <div className="relative">
                      <Input
                        id="coupon-value"
                        type="number"
                        min="0"
                        step="any"
                        value={formData.value}
                        onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                        placeholder={
                          formData.category === 'USG_SCAN'
                            ? '1000'
                            : formData.category === 'CT_SCAN'
                              ? '2000'
                              : formData.category === 'MRI_SCAN'
                                ? '3000'
                                : formData.category === 'PHARMACY_FIXED'
                                  ? '500'
                                  : formData.category === 'MEMBERSHIP_FREE'
                                    ? '6'
                                    : '10'
                        }
                        required
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {selectedCategory.valueSuffix}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{selectedCategory.valueHint}</p>
                  </div>
                </div>

                {selectedCategory.showMinPurchase && (
                  <div className="space-y-2">
                    <Label htmlFor="min-purchase">{selectedCategory.minPurchaseLabel}</Label>
                    <Input
                      id="min-purchase"
                      type="number"
                      min="0"
                      value={formData.minPurchase}
                      onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">{selectedCategory.minPurchaseHint}</p>
                  </div>
                )}

                {isMembership && (
                  <div className="space-y-2">
                    <Label htmlFor="plan-id">Membership plan ID (optional)</Label>
                    <Input
                      id="plan-id"
                      type="number"
                      min="1"
                      value={formData.planId}
                      onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                      placeholder="Leave empty for any plan"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="description">Patient-facing description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={selectedCategory.example}
                    rows={2}
                  />
                </div>
              </section>

              <section className="space-y-4 rounded-xl border bg-card p-4">
                <Label className="text-sm font-semibold">3. Limits & schedule</Label>

                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '30 days', days: 30 },
                    { label: '90 days', days: 90 },
                    { label: '1 year', days: 365 },
                  ].map((preset) => (
                    <Button
                      key={preset.days}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setFormData({ ...formData, validUntil: addDaysToDateInput(preset.days) })}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="valid-until">Valid until</Label>
                    <Input
                      id="valid-until"
                      type="date"
                      value={formData.validUntil}
                      onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-usage">Total redemptions</Label>
                    <Input
                      id="max-usage"
                      type="number"
                      min="1"
                      value={formData.maxUsage}
                      onChange={(e) => setFormData({ ...formData, maxUsage: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-per-user">Per patient</Label>
                    <Input
                      id="max-per-user"
                      type="number"
                      min="1"
                      value={formData.maxUsagePerUser}
                      onChange={(e) => setFormData({ ...formData, maxUsagePerUser: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="corporate-name">Campaign / corporate label</Label>
                  <Input
                    id="corporate-name"
                    value={formData.corporateName}
                    onChange={(e) => setFormData({ ...formData, corporateName: e.target.value })}
                    placeholder="e.g. Mediqzy Corporate, Summer 2026"
                  />
                </div>
              </section>

              <section className="space-y-4 rounded-xl border bg-card p-4">
                <Label className="text-sm font-semibold">4. Audience</Label>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Restrict to specific patients</p>
                    <p className="text-xs text-muted-foreground">Off = any eligible patient can redeem</p>
                  </div>
                  <Switch
                    checked={formData.audience === 'specific'}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, audience: checked ? 'specific' : 'all' })
                    }
                  />
                </div>

                {formData.audience === 'specific' && (
                  <div className="space-y-2">
                    <Label htmlFor="assigned-users">Patient user IDs</Label>
                    <Input
                      id="assigned-users"
                      value={formData.assignedUserIds}
                      onChange={(e) => setFormData({ ...formData, assignedUserIds: e.target.value })}
                      placeholder="101, 245, 902"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="terms">Terms & conditions (optional)</Label>
                  <Textarea
                    id="terms"
                    value={formData.termsAndConditions}
                    onChange={(e) => setFormData({ ...formData, termsAndConditions: e.target.value })}
                    placeholder="Non-transferable. Cannot be combined with other offers."
                    rows={2}
                  />
                </div>
              </section>
            </div>

            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <CouponPreviewCard form={formData} />
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Wand2 className="h-4 w-4" />
                  Where patients use this
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {selectedCategory.group === 'coins' && <li>Health Coins wallet checkout</li>}
                  {selectedCategory.group === 'membership' && <li>Membership purchase & upgrade</li>}
                  {selectedCategory.group === 'pharmacy' && <li>Online medicine cart checkout</li>}
                  {selectedCategory.group === 'diagnostics' && <li>Lab Tests → Imaging booking</li>}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : editingCoupon ? (
                    'Save changes'
                  ) : (
                    'Publish promotion'
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function createEmptyForm(): CouponFormState {
  return {
    ...DEFAULT_FORM,
    validUntil: addDaysToDateInput(365),
  };
}

export function formFromCoupon(coupon: any): CouponFormState {
  const assigned = Array.isArray(coupon.metadata?.assignedUserIds) ? coupon.metadata.assignedUserIds : [];
  return {
    code: coupon.code,
    category: categoryFromCoupon(coupon),
    value: String(coupon.value),
    minPurchase: String(coupon.minPurchase ?? 0),
    maxUsage: String(coupon.maxUsage),
    maxUsagePerUser: String(coupon.maxUsagePerUser),
    validUntil: coupon.validUntil ? format(new Date(coupon.validUntil), 'yyyy-MM-dd') : '',
    corporateName: coupon.corporateName || '',
    assignedUserIds: assigned.join(', '),
    planId: coupon.metadata?.planId ? String(coupon.metadata.planId) : '',
    description: coupon.description || '',
    termsAndConditions: coupon.termsAndConditions || '',
    audience: assigned.length > 0 ? 'specific' : 'all',
  };
}
