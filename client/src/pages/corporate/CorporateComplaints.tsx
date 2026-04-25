import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, AlertCircle, Clock, CheckCircle, XCircle, Search, Filter, Plus, Eye, MessagesSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import CorporateStatusBadge from '@/components/corporate/CorporateStatusBadge';

interface Complaint {
  id: string;
  employeeName: string;
  employeeId: string;
  category: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  submittedDate: string;
  assignedTo: string;
  lastUpdate: string;
}

const CorporateComplaints: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<Complaint['status']>('open');

  const [newCategory, setNewCategory] = useState('');
  const [newPriority, setNewPriority] = useState<Complaint['priority']>('medium');
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const loadComplaints = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/complaints', {
        params: {
          q: searchQuery || undefined,
          status: statusFilter,
        },
      });
      const list = ((data as any)?.data?.complaints || []) as Complaint[];
      setComplaints(list);
    } catch (error: any) {
      toast({
        title: 'Failed to load complaints',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, [statusFilter]);

  const stats = {
    total: complaints.length,
    open: complaints.filter(c => c.status === 'open').length,
    inProgress: complaints.filter(c => c.status === 'in-progress').length,
    resolved: complaints.filter(c => c.status === 'resolved').length,
    urgent: complaints.filter(c => c.priority === 'urgent').length
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const matchesSearch =
        complaint.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        complaint.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        complaint.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || complaint.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [complaints, searchQuery, statusFilter]);

  const getStatusColor = (status: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-slate-800 text-slate-200 border-slate-600';
      default:
        return 'bg-slate-800 text-slate-200 border-slate-600';
    }
  };

  // SLA: days since complaint was submitted
  const getSLAInfo = (submittedDate: string, status: string) => {
    if (status === 'resolved' || status === 'closed') return null;
    const days = Math.floor((Date.now() - new Date(submittedDate).getTime()) / 86400000);
    if (days >= 7) return { label: `${days}d — Overdue`, color: 'bg-red-500/20 text-red-400' };
    if (days >= 3) return { label: `${days}d — At Risk`, color: 'bg-amber-500/20 text-amber-400' };
    return { label: `${days}d — On Track`, color: 'bg-emerald-500/20 text-emerald-400' };
  };

  // Valid status machine transitions
  const VALID_TRANSITIONS: Record<string, Complaint['status'][]> = {
    'open': ['in-progress'],
    'in-progress': ['resolved', 'closed'],
    'resolved': ['closed'],
    'closed': [],
  };

  const getPriorityColor = (priority: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-purple-100 text-purple-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-slate-800 text-slate-200';
      default:
        return 'bg-slate-800 text-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-4 w-4" />;
      case 'in-progress':
        return <Clock className="h-4 w-4" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4" />;
      case 'closed':
        return <XCircle className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const handleSubmitComplaint = async () => {
    try {
      if (!newCategory || !newSubject || !newDescription) {
        toast({
          title: 'Missing fields',
          description: 'Category, subject, and description are required.',
          variant: 'destructive',
        });
        return;
      }

      const { data } = await api.post('/corporate/complaints', {
        category: newCategory,
        subject: newSubject,
        description: newDescription,
        priority: newPriority,
        employeeName: '—',
        employeeId: '—',
      });

      const created = (data as any)?.data?.complaint as Complaint | undefined;
      if (created) setComplaints((prev) => [created, ...prev]);
      else await loadComplaints();

      toast({
        title: 'Complaint Submitted',
        description: "Your grievance has been submitted successfully. We'll respond within 24 hours.",
      });
      setIsSubmitDialogOpen(false);
      setNewCategory('');
      setNewPriority('medium');
      setNewSubject('');
      setNewDescription('');
    } catch (error: any) {
      toast({
        title: 'Submission failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleView = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setViewOpen(true);
  };

  const handleOpenUpdate = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setUpdateStatus(complaint.status);
    setUpdateOpen(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedComplaint) return;
    try {
      const { data } = await api.put(`/corporate/complaints/${encodeURIComponent(selectedComplaint.id)}`, {
        status: updateStatus,
      });
      const updated = (data as any)?.data?.complaint as Complaint | undefined;
      setComplaints((prev) =>
        prev.map((c) => (c.id === selectedComplaint.id ? (updated || { ...c, status: updateStatus }) : c))
      );
      toast({ title: 'Updated', description: 'Complaint status updated.' });
      setUpdateOpen(false);
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <CorporateLayout title="Complaints">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={MessagesSquare}
          title="Complaints & Grievances"
          description="Manage employee complaints, feedback, and grievance resolutions"
          gradient="from-orange-500 to-orange-700"
          badge={`${complaints.length} Complaints`}
          showSearch={true}
          searchPlaceholder="Search by employee name, subject, or category..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showRefresh={true}
          onRefresh={loadComplaints}
          isRefreshing={isLoading}
          stats={[
            { label: 'Total', value: stats.total },
            { label: 'Open', value: stats.open },
            { label: 'In Progress', value: stats.inProgress },
            { label: 'Urgent', value: stats.urgent },
          ]}
          showAdd={true}
          addLabel="Submit Complaint"
          onAdd={() => setIsSubmitDialogOpen(true)}
        />

        {/* Submit Complaint Dialog */}
        <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Submit New Complaint</DialogTitle>
              <DialogDescription>
                Report an issue or concern regarding health benefits or services
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insurance">Insurance Coverage</SelectItem>
                    <SelectItem value="benefits">Health Benefits</SelectItem>
                    <SelectItem value="provider">Provider Network</SelectItem>
                    <SelectItem value="appointment">Appointment Scheduling</SelectItem>
                    <SelectItem value="billing">Billing Issues</SelectItem>
                    <SelectItem value="service">Service Quality</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as Complaint['priority'])}>
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="Brief description of the issue"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Detailed Description</Label>
                <Textarea 
                  id="description" 
                  placeholder="Please provide details about your complaint..." 
                  rows={5}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitComplaint}>Submit Complaint</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <MessageSquare className="h-4 w-4 text-blue-600" />
            </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All complaints</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.open}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">Being resolved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
            <p className="text-xs text-muted-foreground">Successfully resolved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.urgent}</div>
            <p className="text-xs text-muted-foreground">Requires immediate action</p>
          </CardContent>
        </Card>
      </div>

      {/* Complaints List */}
      <Card>
        <CardHeader>
          <CardTitle>Complaint Management</CardTitle>
          <CardDescription>Track and resolve employee complaints</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={viewOpen} onOpenChange={setViewOpen}>
            <DialogContent className="sm:max-w-[650px]">
              <DialogHeader>
                <DialogTitle>Complaint Details</DialogTitle>
                <DialogDescription>Review the complaint information</DialogDescription>
              </DialogHeader>

              {selectedComplaint ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{selectedComplaint.id}</Badge>
                    <Badge className={getStatusColor(selectedComplaint.status)}>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(selectedComplaint.status)}
                        <span className="capitalize">{selectedComplaint.status.replace('-', ' ')}</span>
                      </div>
                    </Badge>
                    <Badge className={getPriorityColor(selectedComplaint.priority)}>
                      {selectedComplaint.priority.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="text-lg font-semibold">{selectedComplaint.subject}</div>
                    <div className="text-sm text-slate-400">Category: {selectedComplaint.category}</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-400">Employee</div>
                      <div className="font-semibold">{selectedComplaint.employeeName}</div>
                      <div className="text-xs text-slate-400">{selectedComplaint.employeeId}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Assigned To</div>
                      <div className="font-semibold">{selectedComplaint.assignedTo}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Submitted</div>
                      <div className="font-semibold">{new Date(selectedComplaint.submittedDate).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Last Update</div>
                      <div className="font-semibold">{new Date(selectedComplaint.lastUpdate).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="text-sm">
                    <div className="font-semibold mb-1">Description</div>
                    <div className="text-slate-300 whitespace-pre-wrap">{selectedComplaint.description}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No complaint selected.</div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Update Complaint Status</DialogTitle>
                <DialogDescription>Set the current status for this complaint</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={updateStatus} onValueChange={(v) => setUpdateStatus(v as Complaint['status'])}>
                    <SelectTrigger id="status"><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      {selectedComplaint && VALID_TRANSITIONS[selectedComplaint.status]?.length === 0 ? (
                        <SelectItem value={selectedComplaint.status} disabled>
                          No further transitions available
                        </SelectItem>
                      ) : (
                        selectedComplaint && VALID_TRANSITIONS[selectedComplaint.status]?.map(s => (
                          <SelectItem key={s} value={s}>{s.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setUpdateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateStatus}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee, subject, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {isLoading && (
              <div className="text-sm text-slate-400">Loading complaints…</div>
            )}
            {filteredComplaints.map((complaint) => (
              <Card key={complaint.id} className={`border-l-4 ${
                complaint.priority === 'urgent' ? 'border-l-red-500' :
                complaint.priority === 'high' ? 'border-l-orange-500' :
                complaint.priority === 'medium' ? 'border-l-yellow-500' :
                'border-l-gray-300'
              }`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{complaint.subject}</h3>
                        <Badge variant="outline">{complaint.id}</Badge>
                        <Badge className={getStatusColor(complaint.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(complaint.status)}
                            <span className="capitalize">{complaint.status.replace('-', ' ')}</span>
                          </div>
                        </Badge>
                        <Badge className={getPriorityColor(complaint.priority)}>
                          {complaint.priority.toUpperCase()}
                        </Badge>
                        {(() => {
                          const sla = getSLAInfo(complaint.submittedDate, complaint.status);
                          return sla ? <Badge className={`${sla.color} text-[10px]`}>{sla.label}</Badge> : null;
                        })()}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Employee</p>
                          <p className="font-semibold">{complaint.employeeName}</p>
                          <p className="text-xs text-slate-400">{complaint.employeeId}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Category</p>
                          <p className="font-semibold">{complaint.category}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Assigned To</p>
                          <p className="font-semibold">{complaint.assignedTo}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Submitted</p>
                          <p className="font-semibold">{new Date(complaint.submittedDate).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="text-sm text-slate-400">
                        <strong>Description:</strong> {complaint.description}
                      </div>

                      <div className="text-xs text-slate-400">
                        Last updated: {new Date(complaint.lastUpdate).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => handleView(complaint)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {complaint.status !== 'closed' && complaint.status !== 'resolved' && (
                        <Button size="sm" onClick={() => handleOpenUpdate(complaint)}>
                          Update Status
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredComplaints.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No complaints found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </CorporateLayout>
  );
};

export default CorporateComplaints;
