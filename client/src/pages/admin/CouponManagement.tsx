/**
 * Coupon Management Page - Admin Dashboard
 * Manage corporate HC purchase coupons
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { Ticket, Plus, Trash2, Edit, Calendar, TrendingUp, Users, Coins } from 'lucide-react';
import { format } from 'date-fns';

const COUPON_CATEGORIES = {
  FIXED_HC: {
    label: 'Bonus HC',
    type: 'FIXED_HC',
    scopes: ['COINS_PURCHASE'],
    valueHint: 'HC amount',
    minPurchaseHint: 'Min HC for percentage coupons',
    minPurchaseLabel: 'Min Purchase',
  },
  FREE_HC: {
    label: 'Free HC',
    type: 'FREE_HC',
    scopes: ['COINS_PURCHASE'],
    valueHint: 'HC amount',
    minPurchaseHint: 'Min HC for percentage coupons',
    minPurchaseLabel: 'Min Purchase',
  },
  PERCENTAGE_HC: {
    label: 'Discount % (HC)',
    type: 'PERCENTAGE',
    scopes: ['COINS_PURCHASE'],
    valueHint: 'Discount percentage',
    minPurchaseHint: 'Min HC for percentage coupons',
    minPurchaseLabel: 'Min Purchase',
  },
  MEMBERSHIP: {
    label: 'Membership Discount %',
    type: 'PERCENTAGE',
    scopes: ['GYM_MEMBERSHIP', 'MEMBERSHIP'],
    valueHint: 'Discount percentage on plan price',
    minPurchaseHint: 'Minimum membership order amount in INR',
    minPurchaseLabel: 'Min Order (INR)',
  },
  MEMBERSHIP_FREE: {
    label: 'Membership Free',
    type: 'PERCENTAGE',
    scopes: ['GYM_MEMBERSHIP', 'MEMBERSHIP'],
    grantType: 'FREE_MEMBERSHIP',
    valueHint: 'Number of free months (e.g. 6)',
    minPurchaseHint: 'Not used for free membership coupons',
    minPurchaseLabel: 'Min Order (INR)',
  },
  PHARMACY_FIXED: {
    label: 'Pharmacy ₹ Discount',
    type: 'PERCENTAGE',
    scopes: ['PHARMACY_PURCHASE'],
    grantType: 'FIXED_INR',
    valueHint: 'Flat discount in INR (e.g. 500)',
    minPurchaseHint: 'Minimum medicine order amount in INR',
    minPurchaseLabel: 'Min Order (INR)',
  },
  PHARMACY_PERCENT: {
    label: 'Pharmacy Discount %',
    type: 'PERCENTAGE',
    scopes: ['PHARMACY_PURCHASE'],
    valueHint: 'Discount percentage on medicine order',
    minPurchaseHint: 'Minimum medicine order amount in INR',
    minPurchaseLabel: 'Min Order (INR)',
  },
  USG_SCAN: {
    label: 'USG Scan Fixed Price',
    type: 'PERCENTAGE',
    scopes: ['USG_SCAN'],
    grantType: 'FIXED_BOOKING_PRICE',
    valueHint: 'Fixed booking price in INR (e.g. 1000)',
    minPurchaseHint: 'Not used for fixed scan price coupons',
    minPurchaseLabel: 'Min Order (INR)',
  },
  CT_SCAN: {
    label: 'CT Scan Fixed Price',
    type: 'PERCENTAGE',
    scopes: ['CT_SCAN'],
    grantType: 'FIXED_BOOKING_PRICE',
    valueHint: 'Fixed booking price in INR (e.g. 2000)',
    minPurchaseHint: 'Not used for fixed scan price coupons',
    minPurchaseLabel: 'Min Order (INR)',
  },
  MRI_SCAN: {
    label: 'MRI Scan Fixed Price',
    type: 'PERCENTAGE',
    scopes: ['MRI_SCAN'],
    grantType: 'FIXED_BOOKING_PRICE',
    valueHint: 'Fixed booking price in INR (e.g. 3000)',
    minPurchaseHint: 'Not used for fixed scan price coupons',
    minPurchaseLabel: 'Min Order (INR)',
  },
} as const;

type CouponCategory = keyof typeof COUPON_CATEGORIES;

const MEMBERSHIP_SCOPES = new Set(['GYM_MEMBERSHIP', 'MEMBERSHIP']);
const PHARMACY_SCOPES = new Set(['PHARMACY_PURCHASE']);
const DIAGNOSTIC_SCOPES = new Set(['USG_SCAN', 'CT_SCAN', 'MRI_SCAN']);

const categoryFromCoupon = (coupon: any): CouponCategory => {
  if (coupon?.metadata?.grantType === 'FREE_MEMBERSHIP') {
    return 'MEMBERSHIP_FREE';
  }

  if (coupon?.metadata?.grantType === 'FIXED_INR') {
    return 'PHARMACY_FIXED';
  }

  const scopes = Array.isArray(coupon?.metadata?.scopes) ? coupon.metadata.scopes : [];

  if (coupon?.metadata?.grantType === 'FIXED_BOOKING_PRICE') {
    if (scopes.includes('USG_SCAN')) return 'USG_SCAN';
    if (scopes.includes('CT_SCAN')) return 'CT_SCAN';
    if (scopes.includes('MRI_SCAN')) return 'MRI_SCAN';
  }

  if (coupon?.type === 'PERCENTAGE' && scopes.some((scope: string) => DIAGNOSTIC_SCOPES.has(scope))) {
    if (scopes.includes('USG_SCAN')) return 'USG_SCAN';
    if (scopes.includes('CT_SCAN')) return 'CT_SCAN';
    return 'MRI_SCAN';
  }

  if (coupon?.type === 'PERCENTAGE' && scopes.some((scope: string) => PHARMACY_SCOPES.has(scope))) {
    return 'PHARMACY_PERCENT';
  }
  if (coupon?.type === 'PERCENTAGE' && scopes.some((scope: string) => MEMBERSHIP_SCOPES.has(scope))) {
    return 'MEMBERSHIP';
  }
  if (coupon?.type === 'PERCENTAGE') return 'PERCENTAGE_HC';
  if (coupon?.type === 'FREE_HC') return 'FREE_HC';
  return 'FIXED_HC';
};

const buildCouponPayload = (formData: {
  code: string;
  category: CouponCategory;
  value: string;
  minPurchase: string;
  maxUsage: string;
  maxUsagePerUser: string;
  validUntil: string;
  corporateName: string;
  assignedUserIds: string;
  planId: string;
  description: string;
  termsAndConditions: string;
}) => {
  const category = COUPON_CATEGORIES[formData.category];
  const parsedPlanId = formData.planId.trim() ? parseInt(formData.planId.trim(), 10) : undefined;

  return {
    code: formData.code,
    type: category.type,
    scopes: category.scopes,
    ...(category.grantType ? { grantType: category.grantType } : {}),
    ...(parsedPlanId ? { planId: parsedPlanId } : {}),
    value: formData.value,
    minPurchase: ['MEMBERSHIP_FREE', 'USG_SCAN', 'CT_SCAN', 'MRI_SCAN'].includes(formData.category) ? '0' : formData.minPurchase,
    maxUsage: formData.maxUsage,
    maxUsagePerUser: formData.maxUsagePerUser,
    validUntil: formData.validUntil,
    corporateName: formData.corporateName,
    description: formData.description,
    termsAndConditions: formData.termsAndConditions,
    assignedUserIds: formData.assignedUserIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  };
};

export default function CouponManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sampleAssignUserId, setSampleAssignUserId] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    category: 'FIXED_HC' as CouponCategory,
    value: '',
    minPurchase: '0',
    maxUsage: '1',
    maxUsagePerUser: '1',
    validUntil: '',
    corporateName: '',
    assignedUserIds: '',
    planId: '',
    description: '',
    termsAndConditions: ''
  });

  const selectedCategory = COUPON_CATEGORIES[formData.category];
  const isMembershipCoupon = formData.category === 'MEMBERSHIP' || formData.category === 'MEMBERSHIP_FREE';
  const isPharmacyCoupon = formData.category === 'PHARMACY_FIXED' || formData.category === 'PHARMACY_PERCENT';
  const isDiagnosticCoupon = formData.category === 'USG_SCAN' || formData.category === 'CT_SCAN' || formData.category === 'MRI_SCAN';
  const isFreeMembershipCoupon = formData.category === 'MEMBERSHIP_FREE';
  const isPercentageCoupon = formData.category === 'PERCENTAGE_HC' || formData.category === 'MEMBERSHIP' || formData.category === 'PHARMACY_PERCENT';
  const usesInrMinPurchase = isPercentageCoupon || formData.category === 'PHARMACY_FIXED';

  // Fetch coupons
  const { data: couponsData, isLoading } = useQuery({
    queryKey: ['admin-coupons', searchQuery, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      
      const { data } = await api.get(`/coupons?${params.toString()}`);
      return data;
    }
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['coupon-stats'],
    queryFn: async () => {
      const { data } = await api.get('/coupons/stats');
      return data.stats;
    }
  });

  // Create coupon mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/coupons', data);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Coupon created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['coupon-stats'] });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create coupon',
        variant: 'destructive',
      });
    }
  });

  // Update coupon mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      const response = await api.put(`/coupons/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Coupon updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      setEditingCoupon(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update coupon',
        variant: 'destructive',
      });
    }
  });

  // Delete coupon mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete(`/coupons/${id}`);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Coupon deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['coupon-stats'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete coupon',
        variant: 'destructive',
      });
    }
  });

  // Assign sample coupons mutation (team-only)
  const assignSampleMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await api.post('/coupons/sample/assign', { userId });
      return response.data;
    },
    onSuccess: (data) => {
      const assignedCodes = Array.isArray(data?.coupons)
        ? data.coupons.map((coupon: any) => coupon.code).join(', ')
        : '';

      toast({
        title: 'Sample Coupons Assigned',
        description: assignedCodes
          ? `Assigned: ${assignedCodes}`
          : 'Sample coupons were assigned successfully.',
      });

      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['coupon-stats'] });
      setSampleAssignUserId('');
    },
    onError: (error: any) => {
      toast({
        title: 'Assignment Failed',
        description: error.response?.data?.message || 'Failed to assign sample coupons',
        variant: 'destructive',
      });
    }
  });

  const resetForm = () => {
    setFormData({
      code: '',
      category: 'FIXED_HC',
      value: '',
      minPurchase: '0',
      maxUsage: '1',
      maxUsagePerUser: '1',
      validUntil: '',
      corporateName: '',
      assignedUserIds: '',
      planId: '',
      description: '',
      termsAndConditions: ''
    });
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
    setFormData({
      code: coupon.code,
      category: categoryFromCoupon(coupon),
      value: coupon.value.toString(),
      minPurchase: coupon.minPurchase.toString(),
      maxUsage: coupon.maxUsage.toString(),
      maxUsagePerUser: coupon.maxUsagePerUser.toString(),
      validUntil: coupon.validUntil ? format(new Date(coupon.validUntil), 'yyyy-MM-dd') : '',
      corporateName: coupon.corporateName || '',
      assignedUserIds: Array.isArray(coupon.metadata?.assignedUserIds) ? coupon.metadata.assignedUserIds.join(', ') : '',
      planId: coupon.metadata?.planId ? String(coupon.metadata.planId) : '',
      description: coupon.description || '',
      termsAndConditions: coupon.termsAndConditions || ''
    });
    setShowCreateDialog(true);
  };

  const getCouponTypeDisplay = (coupon: any) => {
    const category = categoryFromCoupon(coupon);
    const types: Record<CouponCategory, { label: string; color: string }> = {
      PERCENTAGE_HC: { label: 'Discount % (HC)', color: 'bg-blue-500' },
      FIXED_HC: { label: 'Bonus HC', color: 'bg-green-500' },
      FREE_HC: { label: 'Free HC', color: 'bg-purple-500' },
      MEMBERSHIP: { label: 'Membership Discount %', color: 'bg-amber-500' },
      MEMBERSHIP_FREE: { label: 'Membership Free', color: 'bg-rose-500' },
      PHARMACY_FIXED: { label: 'Pharmacy ₹ Discount', color: 'bg-cyan-500' },
      PHARMACY_PERCENT: { label: 'Pharmacy Discount %', color: 'bg-sky-500' },
      USG_SCAN: { label: 'USG Fixed Price', color: 'bg-teal-500' },
      CT_SCAN: { label: 'CT Fixed Price', color: 'bg-indigo-500' },
      MRI_SCAN: { label: 'MRI Fixed Price', color: 'bg-violet-500' },
    };
    return types[category] || types.FIXED_HC;
  };

  const formatCouponValue = (coupon: any) => {
    const category = categoryFromCoupon(coupon);
    if (category === 'MEMBERSHIP_FREE') {
      const months = coupon.metadata?.freeMonths ?? coupon.value;
      return `${months} month${Number(months) === 1 ? '' : 's'} free`;
    }
    if (category === 'PHARMACY_FIXED') {
      return `₹${coupon.value} off`;
    }
    if (category === 'USG_SCAN' || category === 'CT_SCAN' || category === 'MRI_SCAN') {
      return `₹${coupon.metadata?.bookingPrice ?? coupon.value} booking`;
    }
    if (category === 'PERCENTAGE_HC' || category === 'MEMBERSHIP' || category === 'PHARMACY_PERCENT') {
      return `${coupon.value}%`;
    }
    return `${coupon.value} HC`;
  };

  const coupons = couponsData?.coupons || [];

  const handleAssignSampleCoupons = () => {
    const userId = parseInt(sampleAssignUserId, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      toast({
        title: 'Invalid User ID',
        description: 'Enter a valid positive numeric user ID.',
        variant: 'destructive',
      });
      return;
    }

    assignSampleMutation.mutate(userId);
  };

  return (
    <AdminLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Ticket className="h-8 w-8 text-primary" />
            Coupon Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage HC purchase and membership plan coupons
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Coupon
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Coupons</p>
                <p className="text-2xl font-bold">{statsData?.total || 0}</p>
              </div>
              <Ticket className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Coupons</p>
                <p className="text-2xl font-bold text-green-600">{statsData?.active || 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-orange-600">{statsData?.expired || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Usage</p>
                <p className="text-2xl font-bold text-blue-600">{statsData?.totalUsage || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Search</Label>
              <Input
                placeholder="Search by code, corporate name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <Label>Status Filter</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Coupons</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Sample Coupon Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-emerald-600" />
            Assign Sample Coupons
          </CardTitle>
          <CardDescription>
            Team users can assign predefined sample coupon bundles to a specific user ID.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="w-full sm:max-w-xs">
              <Label htmlFor="sample-assign-user-id">Target User ID</Label>
              <Input
                id="sample-assign-user-id"
                type="number"
                min="1"
                placeholder="e.g. 123"
                value={sampleAssignUserId}
                onChange={(e) => setSampleAssignUserId(e.target.value)}
              />
            </div>
            <Button
              onClick={handleAssignSampleCoupons}
              disabled={assignSampleMutation.isPending || !sampleAssignUserId.trim()}
            >
              {assignSampleMutation.isPending ? 'Assigning...' : 'Assign Sample Coupons'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Coupons Table */}
      <Card>
        <CardHeader>
          <CardTitle>Coupons</CardTitle>
          <CardDescription>All coupon codes</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon: any) => {
                const typeDisplay = getCouponTypeDisplay(coupon);
                const isExpired = new Date(coupon.validUntil) < new Date();
                const isActive = coupon.isActive && !isExpired;
                const scopes = Array.isArray(coupon.metadata?.scopes) ? coupon.metadata.scopes.join(', ') : 'COINS_PURCHASE';

                return (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge className={typeDisplay.color}>{typeDisplay.label}</Badge>
                        <p className="text-[10px] text-muted-foreground">{scopes}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatCouponValue(coupon)}
                    </TableCell>
                    <TableCell>{coupon.corporateName || '-'}</TableCell>
                    <TableCell>
                      {Array.isArray(coupon.metadata?.assignedUserIds) && coupon.metadata.assignedUserIds.length > 0 ? (
                        <Badge variant="outline">{coupon.metadata.assignedUserIds.length} user(s)</Badge>
                      ) : (
                        <Badge variant="secondary">All users</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {coupon.usageCount} / {coupon.maxUsage}
                    </TableCell>
                    <TableCell>{format(new Date(coupon.validUntil), 'PP')}</TableCell>
                    <TableCell>
                      {isActive ? (
                        <Badge variant="default" className="bg-green-600">Active</Badge>
                      ) : isExpired ? (
                        <Badge variant="secondary">Expired</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(coupon)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm('Delete this coupon?')) {
                              deleteMutation.mutate(coupon.id);
                            }
                          }}
                          disabled={coupon.usageCount > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setEditingCoupon(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}</DialogTitle>
            <DialogDescription>
              {editingCoupon ? 'Update coupon details' : 'Create a new HC purchase or membership coupon'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Coupon Code *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="CORP100"
                  required
                  disabled={editingCoupon && editingCoupon.usageCount > 0}
                />
              </div>

              <div>
                <Label>Type *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: CouponCategory) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_HC">Bonus HC</SelectItem>
                    <SelectItem value="FREE_HC">Free HC</SelectItem>
                    <SelectItem value="PERCENTAGE_HC">Discount % (HC)</SelectItem>
                    <SelectItem value="MEMBERSHIP">Membership Discount %</SelectItem>
                    <SelectItem value="MEMBERSHIP_FREE">Membership Free</SelectItem>
                    <SelectItem value="PHARMACY_FIXED">Pharmacy ₹ Discount</SelectItem>
                    <SelectItem value="PHARMACY_PERCENT">Pharmacy Discount %</SelectItem>
                    <SelectItem value="USG_SCAN">USG Scan Fixed Price</SelectItem>
                    <SelectItem value="CT_SCAN">CT Scan Fixed Price</SelectItem>
                    <SelectItem value="MRI_SCAN">MRI Scan Fixed Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Value *</Label>
                <Input
                  type="number"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={
                    isFreeMembershipCoupon ? '6'
                    : formData.category === 'USG_SCAN' ? '1000'
                    : formData.category === 'CT_SCAN' ? '2000'
                    : formData.category === 'MRI_SCAN' ? '3000'
                    : formData.category === 'PHARMACY_FIXED' ? '500'
                    : isPercentageCoupon ? '10' : '100'
                  }
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedCategory.valueHint}
                </p>
              </div>

              <div>
                <Label>{selectedCategory.minPurchaseLabel}</Label>
                <Input
                  type="number"
                  value={formData.minPurchase}
                  onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                  placeholder="0"
                  disabled={!usesInrMinPurchase && !isPharmacyCoupon}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {usesInrMinPurchase || isPharmacyCoupon ? selectedCategory.minPurchaseHint : 'Only used for percentage-based coupons'}
                </p>
              </div>
            </div>

            {isDiagnosticCoupon && (
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 text-sm text-muted-foreground">
                Patient books the matching scan type at the fixed INR price in Value. Example: USG coupon code <strong>USG</strong> with Value <strong>1000</strong> books ultrasound at ₹1000.
              </div>
            )}

            {isPharmacyCoupon && (
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-sm text-muted-foreground">
                {formData.category === 'PHARMACY_FIXED'
                  ? 'Example: Value 500 + Min Order 500 gives ₹500 off online medicine orders of ₹500 or more (₹500 cart becomes free before delivery).'
                  : 'Applies a percentage discount to the medicine subtotal on online pharmacy orders.'}
              </div>
            )}

            {isFreeMembershipCoupon && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-muted-foreground">
                Grants the selected membership plan free for the number of months entered in Value (e.g. 6 = six months free, no payment).
              </div>
            )}

            {isMembershipCoupon && (
              <div>
                <Label>Membership Plan ID</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.planId}
                  onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                  placeholder="Optional — lock coupon to one plan"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to allow redemption on any active membership plan.
                </p>
              </div>
            )}

            {formData.category === 'MEMBERSHIP' && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                Membership coupons apply a percentage discount when users purchase or upgrade a health membership plan.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Max Usage *</Label>
                <Input
                  type="number"
                  value={formData.maxUsage}
                  onChange={(e) => setFormData({ ...formData, maxUsage: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Max Usage Per User *</Label>
                <Input
                  type="number"
                  value={formData.maxUsagePerUser}
                  onChange={(e) => setFormData({ ...formData, maxUsagePerUser: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label>Valid Until *</Label>
              <Input
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>Corporate Name</Label>
              <Input
                value={formData.corporateName}
                onChange={(e) => setFormData({ ...formData, corporateName: e.target.value })}
                placeholder="Company Name"
              />
            </div>

            <div>
              <Label>Assigned User IDs</Label>
              <Input
                value={formData.assignedUserIds}
                onChange={(e) => setFormData({ ...formData, assignedUserIds: e.target.value })}
                placeholder="101, 245, 902 (leave empty for all users)"
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated internal user IDs for user-specific coupon codes.</p>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Coupon description..."
              />
            </div>

            <div>
              <Label>Terms & Conditions</Label>
              <Textarea
                value={formData.termsAndConditions}
                onChange={(e) => setFormData({ ...formData, termsAndConditions: e.target.value })}
                placeholder="Terms and conditions..."
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingCoupon ? 'Update' : 'Create'} Coupon
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setEditingCoupon(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
