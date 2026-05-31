import { useMemo, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { Building2, Loader2, ShieldCheck, Sparkles, UserCog, Wallet } from 'lucide-react';

type PlanLite = {
  id: number;
  name: string;
  code?: string;
  price?: number | string;
  discountedPrice?: number | string;
  durationMonths?: number;
  description?: string;
};

type PlanContextResponse = {
  targetUser: {
    id: number;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  };
  corporate: {
    id: number;
    companyName?: string;
    aggregatorType?: string | null;
    aggregatorId?: number | null;
    status?: string;
  };
  broker?: {
    id: number;
    brokerName?: string;
    email?: string;
    phoneNumber?: string;
    status?: string;
  } | null;
  activeUserPlan?: {
    id: number;
    membershipPlanId?: number;
    status?: string;
    plan?: PlanLite;
  } | null;
  ownership?: {
    isTeamAdmin?: boolean;
    directCorporateOwner?: boolean;
    directUserManager?: boolean;
    associationLink?: boolean;
  };
  availableMasterPlans?: PlanLite[];
};

const toPrice = (value: number | string | undefined | null) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-IN') : '0';
};

const TeamUserPlanCustomization = () => {
  const { toast } = useToast();
  const [targetUserId, setTargetUserId] = useState('');
  const [loadingContext, setLoadingContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [context, setContext] = useState<PlanContextResponse | null>(null);

  const [masterPlanId, setMasterPlanId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [durationMonths, setDurationMonths] = useState('12');
  const [customizationNotes, setCustomizationNotes] = useState('');
  const [applyToUser, setApplyToUser] = useState(true);

  const selectedMasterPlan = useMemo(
    () => context?.availableMasterPlans?.find((p) => String(p.id) === masterPlanId) || null,
    [context?.availableMasterPlans, masterPlanId]
  );

  const loadContext = async () => {
    if (!targetUserId.trim()) {
      toast({ title: 'User ID required', description: 'Enter target user ID first', variant: 'destructive' });
      return;
    }

    try {
      setLoadingContext(true);
      const { data } = await api.get(`/org-membership-plans/team/users/${targetUserId.trim()}/plan-context`);
      if (!data?.success) {
        throw new Error(data?.message || 'Failed to load user plan context');
      }

      setContext(data.data);
      const firstPlan = data.data?.availableMasterPlans?.[0];
      setMasterPlanId(firstPlan ? String(firstPlan.id) : '');
      setName(firstPlan ? `${firstPlan.name} (${data.data?.corporate?.companyName || 'Corporate'})` : '');
      setPrice(firstPlan?.price !== undefined ? String(firstPlan.price) : '');
      setDiscountedPrice(firstPlan?.discountedPrice !== undefined ? String(firstPlan.discountedPrice) : '');
      setDurationMonths(firstPlan?.durationMonths ? String(firstPlan.durationMonths) : '12');

      toast({ title: 'Context loaded', description: 'User ownership chain and plans fetched.' });
    } catch (error: any) {
      setContext(null);
      toast({
        title: 'Unable to fetch context',
        description: error?.response?.data?.message || error?.message || 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingContext(false);
    }
  };

  const onMasterPlanChange = (value: string) => {
    setMasterPlanId(value);
    const plan = context?.availableMasterPlans?.find((item) => String(item.id) === value);
    if (!plan) return;

    setName(`${plan.name} (${context?.corporate?.companyName || 'Corporate'})`);
    setPrice(plan.price !== undefined ? String(plan.price) : '');
    setDiscountedPrice(plan.discountedPrice !== undefined ? String(plan.discountedPrice) : '');
    setDurationMonths(plan.durationMonths ? String(plan.durationMonths) : '12');
  };

  const submitCustomization = async () => {
    if (!context || !masterPlanId) {
      toast({ title: 'Plan required', description: 'Load context and choose a master plan.', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        masterPlanId: Number(masterPlanId),
        name: name.trim() || undefined,
        price: price.trim() ? Number(price) : undefined,
        discountedPrice: discountedPrice.trim() ? Number(discountedPrice) : undefined,
        durationMonths: durationMonths.trim() ? Number(durationMonths) : undefined,
        customizationNotes: customizationNotes.trim() || undefined,
        applyToUser,
      };

      const { data } = await api.post(`/org-membership-plans/team/users/${context.targetUser.id}/customize-plan`, payload);
      if (!data?.success) {
        throw new Error(data?.message || 'Customization failed');
      }

      toast({ title: 'Success', description: data.message || 'Plan customized successfully.' });
      await loadContext();
    } catch (error: any) {
      toast({
        title: 'Customization failed',
        description: error?.response?.data?.message || error?.message || 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-cyan-50 to-emerald-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <Card className="border-slate-200 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <UserCog className="h-5 w-5 text-cyan-600" />
                Team User Plan Customization
              </CardTitle>
              <CardDescription>
                Load target user context from corporate/broker chain, then customize and apply a plan in one flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[240px_auto]">
                <div>
                  <Label htmlFor="target-user-id">Target User ID</Label>
                  <Input
                    id="target-user-id"
                    placeholder="Enter user id"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={loadContext} disabled={loadingContext} className="w-full md:w-auto">
                    {loadingContext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Load Plan Context
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {context && (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-cyan-200 bg-cyan-50/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Corporate Chain</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><span className="font-medium">Company:</span> {context.corporate?.companyName || '-'}</div>
                    <div><span className="font-medium">Aggregator:</span> {context.corporate?.aggregatorType || 'none'}</div>
                    <div><span className="font-medium">Status:</span> {context.corporate?.status || '-'}</div>
                    {context.broker?.brokerName && <div><span className="font-medium">Broker:</span> {context.broker.brokerName}</div>}
                  </CardContent>
                </Card>

                <Card className="border-emerald-200 bg-emerald-50/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><UserCog className="h-4 w-4" /> Target User</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><span className="font-medium">Name:</span> {context.targetUser?.firstName || ''} {context.targetUser?.lastName || ''}</div>
                    <div><span className="font-medium">Email:</span> {context.targetUser?.email || '-'}</div>
                    <div><span className="font-medium">Phone:</span> {context.targetUser?.phoneNumber || '-'}</div>
                    <div className="flex gap-2 pt-1">
                      {context.ownership?.isTeamAdmin && <Badge variant="secondary">Team Admin</Badge>}
                      {context.ownership?.directCorporateOwner && <Badge variant="secondary">Corporate Owner</Badge>}
                      {context.ownership?.directUserManager && <Badge variant="secondary">Direct Manager</Badge>}
                      {context.ownership?.associationLink && <Badge variant="secondary">Association Link</Badge>}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-amber-200 bg-amber-50/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> Active Plan</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><span className="font-medium">Plan:</span> {context.activeUserPlan?.plan?.name || 'No active plan'}</div>
                    <div><span className="font-medium">Status:</span> {context.activeUserPlan?.status || '-'}</div>
                    <div><span className="font-medium">Price:</span> ₹{toPrice(context.activeUserPlan?.plan?.discountedPrice ?? context.activeUserPlan?.plan?.price)}</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200 bg-white/90">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900">
                    <Sparkles className="h-5 w-5 text-amber-500" /> Customize and Apply Plan
                  </CardTitle>
                  <CardDescription>
                    Choose a master plan, override values, and apply directly to user under corporate sponsorship.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Master Plan</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Discounted</TableHead>
                          <TableHead>Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(context.availableMasterPlans || []).map((plan) => (
                          <TableRow
                            key={plan.id}
                            className={String(plan.id) === masterPlanId ? 'bg-cyan-50' : ''}
                            onClick={() => onMasterPlanChange(String(plan.id))}
                          >
                            <TableCell className="font-medium">{plan.name}</TableCell>
                            <TableCell>₹{toPrice(plan.price)}</TableCell>
                            <TableCell>₹{toPrice(plan.discountedPrice)}</TableCell>
                            <TableCell>{plan.durationMonths || '-'} months</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Master Plan ID</Label>
                      <Input value={masterPlanId} onChange={(e) => setMasterPlanId(e.target.value)} />
                    </div>
                    <div>
                      <Label>Custom Plan Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name" />
                    </div>
                    <div>
                      <Label>Price (INR)</Label>
                      <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
                    </div>
                    <div>
                      <Label>Discounted Price (INR)</Label>
                      <Input type="number" min="0" value={discountedPrice} onChange={(e) => setDiscountedPrice(e.target.value)} />
                    </div>
                    <div>
                      <Label>Duration (months)</Label>
                      <Input type="number" min="1" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
                    </div>
                    <div className="flex items-end justify-between rounded-md border bg-slate-50 p-3">
                      <div>
                        <Label className="text-sm">Apply to user immediately</Label>
                        <p className="text-xs text-muted-foreground">If disabled, customization will be saved without assignment.</p>
                      </div>
                      <Switch checked={applyToUser} onCheckedChange={setApplyToUser} />
                    </div>
                  </div>

                  <div>
                    <Label>Customization Notes</Label>
                    <Textarea
                      rows={3}
                      placeholder="Reason/context for plan customization"
                      value={customizationNotes}
                      onChange={(e) => setCustomizationNotes(e.target.value)}
                    />
                  </div>

                  {selectedMasterPlan?.description && (
                    <p className="rounded-md border border-dashed bg-slate-50 p-3 text-sm text-slate-600">
                      <span className="font-medium">Selected master plan notes:</span> {selectedMasterPlan.description}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button onClick={submitCustomization} disabled={submitting || !masterPlanId} className="sm:w-auto">
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Customize {applyToUser ? 'and Apply' : 'Only'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      This action writes immutable audit entries for compliance and traceability.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default TeamUserPlanCustomization;
