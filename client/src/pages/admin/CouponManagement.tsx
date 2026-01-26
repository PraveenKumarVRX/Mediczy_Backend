/**
 * Coupon Management Page - Admin Dashboard
 * Manage corporate HC purchase coupons
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export default function CouponManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    type: 'FIXED_HC',
    value: '',
    minPurchase: '0',
    maxUsage: '1',
    maxUsagePerUser: '1',
    validUntil: '',
    corporateName: '',
    description: '',
    termsAndConditions: ''
  });

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

  const resetForm = () => {
    setFormData({
      code: '',
      type: 'FIXED_HC',
      value: '',
      minPurchase: '0',
      maxUsage: '1',
      maxUsagePerUser: '1',
      validUntil: '',
      corporateName: '',
      description: '',
      termsAndConditions: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (coupon: any) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value.toString(),
      minPurchase: coupon.minPurchase.toString(),
      maxUsage: coupon.maxUsage.toString(),
      maxUsagePerUser: coupon.maxUsagePerUser.toString(),
      validUntil: coupon.validUntil ? format(new Date(coupon.validUntil), 'yyyy-MM-dd') : '',
      corporateName: coupon.corporateName || '',
      description: coupon.description || '',
      termsAndConditions: coupon.termsAndConditions || ''
    });
    setShowCreateDialog(true);
  };

  const getCouponTypeDisplay = (type: string) => {
    const types: Record<string, { label: string; color: string }> = {
      PERCENTAGE: { label: 'Discount %', color: 'bg-blue-500' },
      FIXED_HC: { label: 'Bonus HC', color: 'bg-green-500' },
      FREE_HC: { label: 'Free HC', color: 'bg-purple-500' }
    };
    return types[type] || types.FIXED_HC;
  };

  const coupons = couponsData?.coupons || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Ticket className="h-8 w-8 text-primary" />
            Coupon Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage corporate HC purchase coupons
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
                <TableHead>Usage</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon: any) => {
                const typeDisplay = getCouponTypeDisplay(coupon.type);
                const isExpired = new Date(coupon.validUntil) < new Date();
                const isActive = coupon.isActive && !isExpired;

                return (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                    <TableCell>
                      <Badge className={typeDisplay.color}>{typeDisplay.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : `${coupon.value} HC`}
                    </TableCell>
                    <TableCell>{coupon.corporateName || '-'}</TableCell>
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
              {editingCoupon ? 'Update coupon details' : 'Create a new HC purchase coupon'}
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
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Discount %</SelectItem>
                    <SelectItem value="FIXED_HC">Bonus HC</SelectItem>
                    <SelectItem value="FREE_HC">Free HC</SelectItem>
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
                  placeholder={formData.type === 'PERCENTAGE' ? '10' : '100'}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.type === 'PERCENTAGE' ? 'Discount percentage' : 'HC amount'}
                </p>
              </div>

              <div>
                <Label>Min Purchase</Label>
                <Input
                  type="number"
                  value={formData.minPurchase}
                  onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">Min HC for percentage coupons</p>
              </div>
            </div>

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
  );
}
