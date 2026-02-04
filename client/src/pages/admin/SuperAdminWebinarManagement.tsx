import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, Users, Video, Trash2, Edit, Plus, 
  CheckCircle, XCircle, Clock3, Play, Square, Eye,
  TrendingUp, MessageSquare, UserCheck, BarChart3 
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';

interface Webinar {
  id: number;
  title: string;
  description: string;
  doctor: {
    id: number;
    name: string;
    specialization: string;
  };
  scheduledAt: string;
  duration: number;
  maxParticipants: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  roomName: string;
  totalRegistrations: number;
  totalAttendees: number;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

interface Doctor {
  id: number;
  name: string;
  specialization: string;
  email: string;
}

const SuperAdminWebinarManagement: React.FC = () => {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedWebinar, setSelectedWebinar] = useState<Webinar | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    doctorId: '',
    scheduledAt: '',
    duration: 60,
    maxParticipants: 100,
    recordingEnabled: true,
    chatEnabled: true,
    qaEnabled: true,
    registrationRequired: true,
    autoApproveRegistration: false,
    thumbnailUrl: '',
    tags: [] as string[]
  });

  useEffect(() => {
    fetchWebinars();
    fetchDoctors();
  }, [filterStatus]);

  const fetchWebinars = async () => {
    try {
      setLoading(true);
      const params: any = { page: 1, limit: 50 };
      if (filterStatus !== 'all') {
        params.status = filterStatus;
      }
      
      const response = await api.get('/api/admin/webinars', { params });
      setWebinars(response.data.webinars);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch webinars',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      const response = await api.get('/api/consultation/doctors', { 
        params: { limit: 100 } 
      });
      setDoctors(response.data.doctors || []);
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    }
  };

  const handleCreateWebinar = async () => {
    try {
      const response = await api.post('/api/admin/webinars', formData);
      toast({
        title: 'Success',
        description: 'Webinar created successfully'
      });
      setCreateDialogOpen(false);
      resetForm();
      fetchWebinars();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create webinar',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateWebinar = async () => {
    if (!selectedWebinar) return;
    
    try {
      await api.put(`/api/admin/webinars/${selectedWebinar.id}`, formData);
      toast({
        title: 'Success',
        description: 'Webinar updated successfully'
      });
      setEditDialogOpen(false);
      resetForm();
      fetchWebinars();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update webinar',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteWebinar = async (id: number) => {
    if (!confirm('Are you sure you want to delete this webinar?')) return;
    
    try {
      await api.delete(`/api/admin/webinars/${id}`);
      toast({
        title: 'Success',
        description: 'Webinar deleted successfully'
      });
      fetchWebinars();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete webinar',
        variant: 'destructive'
      });
    }
  };

  const handleViewDetails = async (webinar: Webinar) => {
    try {
      const response = await api.get(`/api/admin/webinars/${webinar.id}`);
      setSelectedWebinar(response.data.webinar);
      setDetailsDialogOpen(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to fetch webinar details',
        variant: 'destructive'
      });
    }
  };

  const openEditDialog = (webinar: Webinar) => {
    setSelectedWebinar(webinar);
    setFormData({
      title: webinar.title,
      description: webinar.description,
      doctorId: webinar.doctor.id.toString(),
      scheduledAt: new Date(webinar.scheduledAt).toISOString().slice(0, 16),
      duration: webinar.duration,
      maxParticipants: webinar.maxParticipants,
      recordingEnabled: true,
      chatEnabled: true,
      qaEnabled: true,
      registrationRequired: true,
      autoApproveRegistration: false,
      thumbnailUrl: '',
      tags: []
    });
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      doctorId: '',
      scheduledAt: '',
      duration: 60,
      maxParticipants: 100,
      recordingEnabled: true,
      chatEnabled: true,
      qaEnabled: true,
      registrationRequired: true,
      autoApproveRegistration: false,
      thumbnailUrl: '',
      tags: []
    });
    setSelectedWebinar(null);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; icon: React.ReactNode }> = {
      scheduled: { color: 'bg-blue-100 text-blue-800', icon: <Clock3 className="w-3 h-3" /> },
      live: { color: 'bg-green-100 text-green-800', icon: <Play className="w-3 h-3" /> },
      completed: { color: 'bg-gray-100 text-gray-800', icon: <CheckCircle className="w-3 h-3" /> },
      cancelled: { color: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3" /> }
    };
    
    const variant = variants[status] || variants.scheduled;
    
    return (
      <Badge className={variant.color}>
        {variant.icon}
        <span className="ml-1 capitalize">{status}</span>
      </Badge>
    );
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Webinar Management</h1>
          <p className="text-gray-600 mt-1">Create and manage doctor webinars</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Webinar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center">
            <Label>Filter by Status:</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All webinars" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All webinars</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Webinars List */}
      {loading ? (
        <div className="text-center py-12">Loading webinars...</div>
      ) : webinars.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            No webinars found. Create your first webinar!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {webinars.map((webinar) => (
            <Card key={webinar.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold">{webinar.title}</h3>
                      {getStatusBadge(webinar.status)}
                    </div>
                    
                    <p className="text-gray-600 mb-4">{webinar.description}</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span>Dr. {webinar.doctor.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span>{formatDateTime(webinar.scheduledAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span>{webinar.duration} minutes</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-gray-500" />
                        <span>{webinar.totalRegistrations} / {webinar.maxParticipants}</span>
                      </div>
                    </div>

                    {webinar.totalAttendees > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                        <TrendingUp className="w-4 h-4" />
                        <span>{webinar.totalAttendees} attendees</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(webinar)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {webinar.status === 'scheduled' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(webinar)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteWebinar(webinar.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Webinar Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Webinar</DialogTitle>
            <DialogDescription>
              Schedule a webinar for doctors to conduct educational sessions
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Understanding Diabetes Management"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the webinar topic"
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="doctor">Doctor *</Label>
              <Select 
                value={formData.doctorId}
                onValueChange={(value) => setFormData({ ...formData, doctorId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((doctor) => (
                    <SelectItem key={doctor.id} value={doctor.id.toString()}>
                      Dr. {doctor.name} - {doctor.specialization}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="scheduledAt">Scheduled Date & Time *</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                  min="15"
                  step="15"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="maxParticipants">Max Participants</Label>
              <Input
                id="maxParticipants"
                type="number"
                value={formData.maxParticipants}
                onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) })}
                min="10"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="recordingEnabled">Enable Recording</Label>
                <Switch
                  id="recordingEnabled"
                  checked={formData.recordingEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, recordingEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="chatEnabled">Enable Chat</Label>
                <Switch
                  id="chatEnabled"
                  checked={formData.chatEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, chatEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="qaEnabled">Enable Q&A</Label>
                <Switch
                  id="qaEnabled"
                  checked={formData.qaEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, qaEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="registrationRequired">Require Registration</Label>
                <Switch
                  id="registrationRequired"
                  checked={formData.registrationRequired}
                  onCheckedChange={(checked) => setFormData({ ...formData, registrationRequired: checked })}
                />
              </div>

              {formData.registrationRequired && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="autoApproveRegistration">Auto-approve Registrations</Label>
                  <Switch
                    id="autoApproveRegistration"
                    checked={formData.autoApproveRegistration}
                    onCheckedChange={(checked) => setFormData({ ...formData, autoApproveRegistration: checked })}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateWebinar} disabled={!formData.title || !formData.doctorId || !formData.scheduledAt}>
              Create Webinar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog - similar structure to Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Webinar</DialogTitle>
          </DialogHeader>
          {/* Same form fields as Create Dialog */}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateWebinar}>
              Update Webinar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      {selectedWebinar && (
        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedWebinar.title}</DialogTitle>
              <DialogDescription>
                Webinar Details and Analytics
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Analytics Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Registrations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{selectedWebinar.totalRegistrations}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Attendees</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{selectedWebinar.totalAttendees}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Capacity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{selectedWebinar.maxParticipants}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Webinar Info */}
              <div className="space-y-2">
                <h3 className="font-semibold">Webinar Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <div className="mt-1">{getStatusBadge(selectedWebinar.status)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Doctor:</span>
                    <div className="mt-1">Dr. {selectedWebinar.doctor.name}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Scheduled:</span>
                    <div className="mt-1">{formatDateTime(selectedWebinar.scheduledAt)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Duration:</span>
                    <div className="mt-1">{selectedWebinar.duration} minutes</div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SuperAdminWebinarManagement;
