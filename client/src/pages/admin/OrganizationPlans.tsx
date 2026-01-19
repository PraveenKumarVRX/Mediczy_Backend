import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { 
  Package, Plus, Edit, Trash2, Copy, RotateCcw, 
  CheckCircle2, XCircle, Info, TrendingUp, Users 
} from 'lucide-react';
import api from '../../utils/api';
import { useToast } from '../../hooks/use-toast';

interface MasterPlan {
  id: number;
  name: string;
  code: string;
  description?: string;
  price: number;
  durationMonths?: number;
  features: any;
  benefits: any[];
  isActive: boolean;
}

interface CustomizedPlan extends MasterPlan {
  masterPlanId?: number;
  organizationId?: number;
  organizationType?: string;
  customizedBy?: number;
  customizationNotes?: string;
  masterPlan?: MasterPlan;
}

const OrganizationPlans = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('my-plans');
  const [customizeDialog, setCustomizeDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [selectedMasterPlan, setSelectedMasterPlan] = useState<MasterPlan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<CustomizedPlan | null>(null);
  
  const [customizationForm, setCustomizationForm] = useState({
    name: '',
    description: '',
    price: 0,
    customizationNotes: ''
  });

  // Fetch master plans
  const { data: masterPlansData } = useQuery({
    queryKey: ['master-plans'],
    queryFn: async () => {
      const { data } = await api.get('/org-membership-plans/master-plans');
      return data.data;
    }
  });

  // Fetch organization's customized plans
  const { data: myPlansData } = useQuery({
    queryKey: ['my-plans'],
    queryFn: async () => {
      const { data } = await api.get('/org-membership-plans/my-plans');
      return data.data;
    }
  });

  // Fetch statistics
  const { data: stats } = useQuery({
    queryKey: ['plan-stats'],
    queryFn: async () => {
      const { data } = await api.get('/org-membership-plans/statistics');
      return data.data;
    }
  });

  // Customize master plan mutation
  const customizePlanMutation = useMutation({
    mutationFn: async ({ masterPlanId, data }: { masterPlanId: number; data: any }) => {
      const response = await api.post(`/org-membership-plans/customize/${masterPlanId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-plans'] });
      queryClient.invalidateQueries({ queryKey: ['plan-stats'] });
      toast({
        title: 'Success',
        description: 'Plan customized successfully for your organization'
      });
      setCustomizeDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to customize plan',
        variant: 'destructive'
      });
    }
  });

  // Update plan mutation
  const updatePlanMutation = useMutation({
    mutationFn: async ({ planId, data }: { planId: number; data: any }) => {
      const response = await api.put(`/org-membership-plans/my-plans/${planId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-plans'] });
      toast({
        title: 'Success',
        description: 'Plan updated successfully'
      });
      setEditDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update plan',
        variant: 'destructive'
      });
    }
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: async (planId: number) => {
      const response = await api.delete(`/org-membership-plans/my-plans/${planId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-plans'] });
      queryClient.invalidateQueries({ queryKey: ['plan-stats'] });
      toast({
        title: 'Success',
        description: 'Plan deactivated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete plan',
        variant: 'destructive'
      });
    }
  });

  // Reset plan to master defaults mutation
  const resetPlanMutation = useMutation({
    mutationFn: async (planId: number) => {
      const response = await api.post(`/org-membership-plans/reset/${planId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-plans'] });
      toast({
        title: 'Success',
        description: 'Plan reset to master defaults'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to reset plan',
        variant: 'destructive'
      });
    }
  });

  const resetForm = () => {
    setCustomizationForm({
      name: '',
      description: '',
      price: 0,
      customizationNotes: ''
    });
    setSelectedMasterPlan(null);
  };

  const openCustomizeDialog = (plan: MasterPlan) => {
    setSelectedMasterPlan(plan);
    setCustomizationForm({
      name: `${plan.name} (Custom)`,
      description: plan.description || '',
      price: plan.price,
      customizationNotes: ''
    });
    setCustomizeDialog(true);
  };

  const openEditDialog = (plan: CustomizedPlan) => {
    setSelectedPlan(plan);
    setCustomizationForm({
      name: plan.name,
      description: plan.description || '',
      price: plan.price,
      customizationNotes: plan.customizationNotes || ''
    });
    setEditDialog(true);
  };

  const handleCustomize = () => {
    if (!selectedMasterPlan) return;
    
    customizePlanMutation.mutate({
      masterPlanId: selectedMasterPlan.id,
      data: customizationForm
    });
  };

  const handleUpdate = () => {
    if (!selectedPlan) return;
    
    updatePlanMutation.mutate({
      planId: selectedPlan.id,
      data: customizationForm
    });
  };

  const handleDelete = (planId: number) => {
    if (confirm('Are you sure you want to deactivate this plan?')) {
      deletePlanMutation.mutate(planId);
    }
  };

  const handleReset = (planId: number) => {
    if (confirm('This will reset all customizations to master plan defaults. Continue?')) {
      resetPlanMutation.mutate(planId);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8 text-blue-500" />
            Membership Plans Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize master plans for your organization
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Plans</p>
                  <p className="text-2xl font-bold">{stats?.totalCustomizedPlans || 0}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Plans</p>
                  <p className="text-2xl font-bold">{stats?.activePlans || 0}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Inactive Plans</p>
                  <p className="text-2xl font-bold">{stats?.inactivePlans || 0}</p>
                </div>
                <XCircle className="h-8 w-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-plans">My Plans ({myPlansData?.count || 0})</TabsTrigger>
            <TabsTrigger value="master-plans">Master Plans ({masterPlansData?.count || 0})</TabsTrigger>
          </TabsList>

          {/* My Customized Plans Tab */}
          <TabsContent value="my-plans" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Organization's Plans</CardTitle>
                <CardDescription>
                  Plans customized for your organization from master templates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {myPlansData?.plans?.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No customized plans yet</p>
                    <p className="text-sm text-muted-foreground">
                      Go to Master Plans tab to customize plans for your organization
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plan Name</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Master Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myPlansData?.plans?.map((plan: CustomizedPlan) => (
                        <TableRow key={plan.id}>
                          <TableCell className="font-medium">{plan.name}</TableCell>
                          <TableCell>₹{plan.price}</TableCell>
                          <TableCell>{plan.durationMonths} months</TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {plan.masterPlan?.name || 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {plan.isActive ? (
                              <Badge variant="default">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(plan)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReset(plan.id)}
                                title="Reset to master defaults"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(plan.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Master Plans Tab */}
          <TabsContent value="master-plans" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Master Plans</CardTitle>
                <CardDescription>
                  Plans created by super admin. Click "Customize" to create your version
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {masterPlansData?.masterPlans?.map((plan: MasterPlan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {plan.code}
                          </code>
                        </TableCell>
                        <TableCell>₹{plan.price}</TableCell>
                        <TableCell>{plan.durationMonths} months</TableCell>
                        <TableCell>
                          {plan.isActive ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => openCustomizeDialog(plan)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Customize
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Customize Dialog */}
        <Dialog open={customizeDialog} onOpenChange={setCustomizeDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Customize Plan for Your Organization</DialogTitle>
            </DialogHeader>
            
            {selectedMasterPlan && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm font-medium">Master Plan: {selectedMasterPlan.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedMasterPlan.description}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label>Plan Name *</Label>
                    <Input
                      value={customizationForm.name}
                      onChange={(e) => setCustomizationForm({ ...customizationForm, name: e.target.value })}
                      placeholder="Enter custom plan name"
                    />
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={customizationForm.description}
                      onChange={(e) => setCustomizationForm({ ...customizationForm, description: e.target.value })}
                      placeholder="Optional description"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Price (₹) *</Label>
                    <Input
                      type="number"
                      value={customizationForm.price}
                      onChange={(e) => setCustomizationForm({ ...customizationForm, price: parseFloat(e.target.value) })}
                      placeholder="Enter price"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Master plan price: ₹{selectedMasterPlan.price}
                    </p>
                  </div>

                  <div>
                    <Label>Customization Notes</Label>
                    <Textarea
                      value={customizationForm.customizationNotes}
                      onChange={(e) => setCustomizationForm({ ...customizationForm, customizationNotes: e.target.value })}
                      placeholder="Why are you customizing this plan?"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setCustomizeDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCustomize} disabled={customizePlanMutation.isPending}>
                {customizePlanMutation.isPending ? 'Creating...' : 'Create Custom Plan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialog} onOpenChange={setEditDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Custom Plan</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Plan Name *</Label>
                <Input
                  value={customizationForm.name}
                  onChange={(e) => setCustomizationForm({ ...customizationForm, name: e.target.value })}
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={customizationForm.description}
                  onChange={(e) => setCustomizationForm({ ...customizationForm, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div>
                <Label>Price (₹) *</Label>
                <Input
                  type="number"
                  value={customizationForm.price}
                  onChange={(e) => setCustomizationForm({ ...customizationForm, price: parseFloat(e.target.value) })}
                />
              </div>

              <div>
                <Label>Customization Notes</Label>
                <Textarea
                  value={customizationForm.customizationNotes}
                  onChange={(e) => setCustomizationForm({ ...customizationForm, customizationNotes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updatePlanMutation.isPending}>
                {updatePlanMutation.isPending ? 'Updating...' : 'Update Plan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default OrganizationPlans;
