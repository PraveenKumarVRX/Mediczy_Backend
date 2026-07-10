/**
 * Promotions & Coupon Hub — team/admin coupon management
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { format } from 'date-fns';
import {
  Calendar,
  Copy,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  buildCouponPayload,
  COUPON_GROUPS,
  formatCouponValue,
  getCouponTypeDisplay,
  PROMO_TEMPLATES,
  type CouponFormState,
  type CouponGroupId,
} from './coupon-management/couponConfig';
import {
  CouponFormSheet,
  createEmptyForm,
  formFromCoupon,
} from './coupon-management/CouponFormSheet';

export default function CouponManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState<CouponGroupId | 'all'>('all');
  const [sampleAssignUserId, setSampleAssignUserId] = useState('');
  const [seedPreviewOpen, setSeedPreviewOpen] = useState(false);
  const [seedPreview, setSeedPreview] = useState<any>(null);

  const [formData, setFormData] = useState<CouponFormState>(createEmptyForm);

  const { data: couponsData, isLoading } = useQuery({
    queryKey: ['admin-coupons', searchQuery, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const { data } = await api.get(`/coupons?${params.toString()}`);
      return data;
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['coupon-stats'],
    queryFn: async () => {
      const { data } = await api.get('/coupons/stats');
      return data.stats;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    queryClient.invalidateQueries({ queryKey: ['coupon-stats'] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => (await api.post('/coupons', data)).data,
    onSuccess: () => {
      toast({ title: 'Promotion published', description: 'Patients can redeem this code at checkout.' });
      invalidate();
      closeForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Could not create promotion',
        description: error.response?.data?.message || 'Please check the form and try again.',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => (await api.put(`/coupons/${id}`, data)).data,
    onSuccess: () => {
      toast({ title: 'Promotion updated' });
      invalidate();
      closeForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.response?.data?.message || 'Failed to update coupon',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/coupons/${id}`)).data,
    onSuccess: () => {
      toast({ title: 'Promotion removed' });
      invalidate();
    },
    onError: (error: any) => {
      toast({
        title: 'Delete failed',
        description: error.response?.data?.message || 'Failed to delete coupon',
        variant: 'destructive',
      });
    },
  });

  const assignSampleMutation = useMutation({
    mutationFn: async (userId: number) => (await api.post('/coupons/sample/assign', { userId })).data,
    onSuccess: (data) => {
      const codes = Array.isArray(data?.coupons) ? data.coupons.map((c: any) => c.code).join(', ') : '';
      toast({
        title: 'Sample bundle assigned',
        description: codes ? codes : 'Sample coupons assigned successfully.',
      });
      invalidate();
      setSampleAssignUserId('');
    },
    onError: (error: any) => {
      toast({
        title: 'Assignment failed',
        description: error.response?.data?.message || 'Failed to assign sample coupons',
        variant: 'destructive',
      });
    },
  });

  const seedPreviewMutation = useMutation({
    mutationFn: async () => (await api.post('/coupons/promo/seed', { execute: false })).data,
    onSuccess: (data) => {
      setSeedPreview(data);
      setSeedPreviewOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Preview unavailable',
        description: error.response?.data?.message || 'Promo seed API not reachable. Deploy latest server or run CLI seed.',
        variant: 'destructive',
      });
    },
  });

  const seedExecuteMutation = useMutation({
    mutationFn: async () => (await api.post('/coupons/promo/seed', { execute: true })).data,
    onSuccess: (data) => {
      toast({
        title: 'Standard promos installed',
        description: `${data?.coupons?.length || 5} codes are live.`,
      });
      invalidate();
      setSeedPreviewOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Install failed',
        description: error.response?.data?.message || 'Failed to seed promo coupons',
        variant: 'destructive',
      });
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingCoupon(null);
    setFormData(createEmptyForm());
  };

  const openCreate = (prefill?: Partial<CouponFormState>) => {
    setEditingCoupon(null);
    setFormData({ ...createEmptyForm(), ...prefill });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildCouponPayload(formData);
    if (editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (coupon: any) => {
    setEditingCoupon(coupon);
    setFormData(formFromCoupon(coupon));
    setShowForm(true);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: 'Copied', description: `${code} copied to clipboard` });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const coupons = couponsData?.coupons || [];

  const filteredCoupons = useMemo(() => {
    if (groupFilter === 'all') return coupons;
    return coupons.filter((coupon: any) => getCouponTypeDisplay(coupon).group === groupFilter);
  }, [coupons, groupFilter]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-amber-500/5 p-6 md:p-8">
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Ticket className="h-6 w-6" />
                <span className="text-sm font-semibold uppercase tracking-wider">Growth</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Promotions Hub</h1>
              <p className="max-w-2xl text-muted-foreground">
                Create and manage offers across Health Coins, membership, pharmacy, and imaging — with live patient previews before you publish.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => seedPreviewMutation.mutate()} disabled={seedPreviewMutation.isPending}>
                {seedPreviewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                Install standard promos
              </Button>
              <Button onClick={() => openCreate()} className="gap-2">
                <Plus className="h-4 w-4" />
                New promotion
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {[
            { label: 'Total codes', value: statsData?.total || 0, icon: Ticket, tone: 'text-primary' },
            { label: 'Active now', value: statsData?.active || 0, icon: TrendingUp, tone: 'text-emerald-600' },
            { label: 'Expired', value: statsData?.expired || 0, icon: Calendar, tone: 'text-orange-600' },
            { label: 'Redemptions', value: statsData?.totalUsage || 0, icon: Users, tone: 'text-blue-600' },
          ].map((stat) => (
            <Card key={stat.label} className="border-muted/60 shadow-sm">
              <CardContent className="flex items-center justify-between p-4 md:p-6">
                <div>
                  <p className="text-xs text-muted-foreground md:text-sm">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <stat.icon className={`h-7 w-7 ${stat.tone} opacity-80`} />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick templates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Popular templates
            </CardTitle>
            <CardDescription>Start from a proven offer — customize before publishing.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {PROMO_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => openCreate(template.patch)}
                  className="group rounded-xl border p-3 text-left transition hover:border-primary/50 hover:bg-primary/5"
                >
                  <p className="font-medium group-hover:text-primary">{template.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters + table */}
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>All promotions</CardTitle>
                <CardDescription>{filteredCoupons.length} shown</CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search code or campaign…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs value={groupFilter} onValueChange={(v) => setGroupFilter(v as CouponGroupId | 'all')}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="all">All</TabsTrigger>
                {COUPON_GROUPS.map((group) => (
                  <TabsTrigger key={group.id} value={group.id}>
                    {group.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading promotions…
              </div>
            ) : filteredCoupons.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Package className="h-10 w-10 text-muted-foreground/60" />
                <p className="font-medium">No promotions yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Create your first offer or install the standard USG, pharmacy, and membership promos in one click.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => seedPreviewMutation.mutate()}>
                    Install standard promos
                  </Button>
                  <Button onClick={() => openCreate()}>Create promotion</Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Offer</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCoupons.map((coupon: any) => {
                      const typeDisplay = getCouponTypeDisplay(coupon);
                      const isExpired = new Date(coupon.validUntil) < new Date();
                      const isActive = coupon.isActive && !isExpired;
                      const usagePct = coupon.maxUsage
                        ? Math.min(100, (coupon.usageCount / coupon.maxUsage) * 100)
                        : 0;

                      return (
                        <TableRow key={coupon.id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold">{coupon.code}</span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                onClick={() => copyCode(coupon.code)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{formatCouponValue(coupon)}</p>
                              <Badge variant="outline" className={typeDisplay.color}>
                                {typeDisplay.label}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {coupon.corporateName || '—'}
                          </TableCell>
                          <TableCell className="min-w-[120px]">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {coupon.usageCount} / {coupon.maxUsage}
                              </p>
                              <Progress value={usagePct} className="h-1.5" />
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{format(new Date(coupon.validUntil), 'dd MMM yyyy')}</TableCell>
                          <TableCell>
                            {isActive ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Live</Badge>
                            ) : isExpired ? (
                              <Badge variant="secondary">Expired</Badge>
                            ) : (
                              <Badge variant="outline">Paused</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(coupon)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={coupon.usageCount > 0}
                                onClick={() => {
                                  if (confirm(`Remove ${coupon.code}?`)) deleteMutation.mutate(coupon.id);
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sample assign — collapsed utility */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Assign demo bundle to a patient</CardTitle>
            <CardDescription>
              Creates per-user sample codes (COINBOOST20U123, etc.) for testing checkout flows.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-56">
              <Label htmlFor="sample-user">Patient user ID</Label>
              <Input
                id="sample-user"
                type="number"
                min="1"
                placeholder="123"
                value={sampleAssignUserId}
                onChange={(e) => setSampleAssignUserId(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              disabled={assignSampleMutation.isPending || !sampleAssignUserId.trim()}
              onClick={() => {
                const userId = parseInt(sampleAssignUserId, 10);
                if (!Number.isInteger(userId) || userId <= 0) {
                  toast({ title: 'Invalid user ID', variant: 'destructive' });
                  return;
                }
                assignSampleMutation.mutate(userId);
              }}
            >
              {assignSampleMutation.isPending ? 'Assigning…' : 'Assign bundle'}
            </Button>
          </CardContent>
        </Card>

        <CouponFormSheet
          open={showForm}
          onOpenChange={setShowForm}
          formData={formData}
          setFormData={setFormData}
          editingCoupon={editingCoupon}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          onReset={closeForm}
        />

        <Dialog open={seedPreviewOpen} onOpenChange={setSeedPreviewOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Install standard promotions</DialogTitle>
              <DialogDescription>
                Upserts USG, CTSCAN, MRI, MED500, and CORP6FREE. Existing codes are updated, not duplicated.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {(seedPreview?.coupons || PROMO_TEMPLATES.map((t) => ({ code: t.patch.code, action: 'upsert' }))).map(
                (row: any) => (
                  <div key={row.code} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-mono font-semibold">{row.code}</span>
                    <Badge variant="outline">{row.action || 'ready'}</Badge>
                  </div>
                )
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSeedPreviewOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => seedExecuteMutation.mutate()} disabled={seedExecuteMutation.isPending}>
                {seedExecuteMutation.isPending ? 'Installing…' : 'Install now'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
