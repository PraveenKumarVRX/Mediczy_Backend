import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Users, Video, UserCheck, 
  CheckCircle, XCircle, Search, Filter,
  MapPin, Star, Tag
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';

interface Webinar {
  id: number;
  title: string;
  description: string;
  scheduledAt: string;
  duration: number;
  status: 'scheduled' | 'live' | 'completed';
  thumbnailUrl?: string;
  tags?: string[];
  doctor: {
    id: number;
    name: string;
    specialization: string;
    image?: string;
  };
  participants: {
    max: number;
    registered: number;
    approved: number;
    spotsLeft: number;
  };
  registrationRequired: boolean;
  userRegistration?: {
    status: string;
    registeredAt: string;
    canJoin: boolean;
  };
  canRegister: boolean;
}

const WebinarListPage: React.FC = () => {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('scheduled');
  const [selectedWebinar, setSelectedWebinar] = useState<Webinar | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWebinars();
  }, [filterStatus, searchTerm]);

  const fetchWebinars = async () => {
    try {
      setLoading(true);
      const params: any = {
        status: filterStatus,
        upcoming: 'true'
      };
      
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await api.get('/api/webinars', { params });
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

  const handleRegister = async (webinarId: number) => {
    try {
      const response = await api.post(`/api/webinars/${webinarId}/register`);
      toast({
        title: 'Success',
        description: response.data.message,
      });
      fetchWebinars(); // Refresh list
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to register',
        variant: 'destructive'
      });
    }
  };

  const handleCancelRegistration = async (webinarId: number) => {
    if (!confirm('Are you sure you want to cancel your registration?')) return;
    
    try {
      await api.delete(`/api/webinars/${webinarId}/register`);
      toast({
        title: 'Success',
        description: 'Registration cancelled successfully'
      });
      fetchWebinars();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to cancel registration',
        variant: 'destructive'
      });
    }
  };

  const handleJoinWebinar = (webinarId: number) => {
    navigate(`/webinar/${webinarId}`);
  };

  const handleViewDetails = async (webinarId: number) => {
    try {
      const response = await api.get(`/api/webinars/${webinarId}`);
      setSelectedWebinar(response.data.webinar);
      setDetailsDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch webinar details',
        variant: 'destructive'
      });
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; text: string }> = {
      scheduled: { color: 'bg-blue-100 text-blue-800', text: 'Upcoming' },
      live: { color: 'bg-green-100 text-green-800', text: 'Live Now' },
      completed: { color: 'bg-gray-100 text-gray-800', text: 'Completed' }
    };
    
    const variant = variants[status] || variants.scheduled;
    
    return (
      <Badge className={variant.color}>
        {variant.text}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Webinars</h1>
          <p className="text-gray-600 mt-1">Join expert-led medical webinars</p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search webinars..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Upcoming</SelectItem>
                <SelectItem value="live">Live Now</SelectItem>
                <SelectItem value="completed">Past Webinars</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Webinars Grid */}
      {loading ? (
        <div className="text-center py-12">Loading webinars...</div>
      ) : webinars.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            <Video className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No webinars found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {webinars.map((webinar) => (
            <Card key={webinar.id} className="hover:shadow-lg transition-shadow overflow-hidden">
              {/* Thumbnail */}
              {webinar.thumbnailUrl ? (
                <img 
                  src={webinar.thumbnailUrl} 
                  alt={webinar.title}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Video className="w-16 h-16 text-white" />
                </div>
              )}

              <CardContent className="pt-4">
                {/* Status Badge */}
                <div className="mb-2">
                  {getStatusBadge(webinar.status)}
                  {webinar.status === 'live' && (
                    <Badge className="ml-2 bg-red-500 text-white animate-pulse">
                      LIVE
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold mb-2 line-clamp-2">
                  {webinar.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {webinar.description}
                </p>

                {/* Doctor Info */}
                <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                    {webinar.doctor.image ? (
                      <img 
                        src={webinar.doctor.image} 
                        alt={webinar.doctor.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <Users className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      Dr. {webinar.doctor.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {webinar.doctor.specialization}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDateTime(webinar.scheduledAt)}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>{webinar.duration} minutes</span>
                  </div>

                  <div className="flex items-center gap-2 text-gray-600">
                    <UserCheck className="w-4 h-4" />
                    <span>
                      {webinar.participants.registered} / {webinar.participants.max} registered
                    </span>
                  </div>
                </div>

                {/* Tags */}
                {webinar.tags && webinar.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {webinar.tags.slice(0, 3).map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {webinar.userRegistration ? (
                    <>
                      {webinar.userRegistration.canJoin ? (
                        <Button 
                          className="flex-1"
                          onClick={() => handleJoinWebinar(webinar.id)}
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Join Now
                        </Button>
                      ) : (
                        <Button 
                          className="flex-1" 
                          variant="outline"
                          disabled
                        >
                          {webinar.userRegistration.status === 'pending' ? (
                            <>
                              <Clock className="w-4 h-4 mr-2" />
                              Pending Approval
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Registered
                            </>
                          )}
                        </Button>
                      )}
                      <Button 
                        variant="outline"
                        onClick={() => handleCancelRegistration(webinar.id)}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </>
                  ) : webinar.canRegister ? (
                    <Button 
                      className="flex-1"
                      onClick={() => handleRegister(webinar.id)}
                    >
                      Register
                    </Button>
                  ) : (
                    <Button 
                      className="flex-1" 
                      variant="outline"
                      disabled
                    >
                      Full
                    </Button>
                  )}

                  <Button 
                    variant="outline"
                    onClick={() => handleViewDetails(webinar.id)}
                  >
                    Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      {selectedWebinar && (
        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedWebinar.title}</DialogTitle>
              <DialogDescription>
                {formatDateTime(selectedWebinar.scheduledAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Status */}
              <div>
                {getStatusBadge(selectedWebinar.status)}
              </div>

              {/* Description */}
              <div>
                <h4 className="font-semibold mb-2">About this webinar</h4>
                <p className="text-gray-600">{selectedWebinar.description}</p>
              </div>

              {/* Doctor */}
              <div>
                <h4 className="font-semibold mb-2">Speaker</h4>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <Users className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium">Dr. {selectedWebinar.doctor.name}</p>
                    <p className="text-sm text-gray-600">{selectedWebinar.doctor.specialization}</p>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-gray-500">Duration</p>
                  <p className="font-medium">{selectedWebinar.duration} minutes</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Participants</p>
                  <p className="font-medium">
                    {selectedWebinar.participants.registered} / {selectedWebinar.participants.max}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Spots Left</p>
                  <p className="font-medium">{selectedWebinar.participants.spotsLeft}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Registration</p>
                  <p className="font-medium">
                    {selectedWebinar.registrationRequired ? 'Required' : 'Open'}
                  </p>
                </div>
              </div>

              {/* User Registration Status */}
              {selectedWebinar.userRegistration && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">
                    Your registration status: {selectedWebinar.userRegistration.status}
                  </p>
                  {selectedWebinar.userRegistration.canJoin && (
                    <p className="text-sm text-blue-700 mt-1">
                      You can join this webinar when it goes live!
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                Close
              </Button>
              {selectedWebinar.userRegistration?.canJoin && (
                <Button onClick={() => {
                  setDetailsDialogOpen(false);
                  handleJoinWebinar(selectedWebinar.id);
                }}>
                  <Video className="w-4 h-4 mr-2" />
                  Join Webinar
                </Button>
              )}
              {!selectedWebinar.userRegistration && selectedWebinar.canRegister && (
                <Button onClick={() => {
                  handleRegister(selectedWebinar.id);
                  setDetailsDialogOpen(false);
                }}>
                  Register Now
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default WebinarListPage;
