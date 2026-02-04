import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Users, Video, Play, Square,
  TrendingUp, MessageSquare, UserCheck, BarChart3,
  Eye, Download, CheckCircle, XCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import api from '@/lib/api';

interface Webinar {
  id: number;
  title: string;
  description: string;
  scheduledAt: string;
  duration: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  totalRegistrations: number;
  approvedRegistrations: number;
  totalAttendees: number;
  peakConcurrentUsers?: number;
  engagementScore?: number;
  roomName: string;
  startedAt?: string;
  endedAt?: string;
  canStart: boolean;
  canEnd: boolean;
}

interface Attendee {
  id: number;
  userId: number;
  name: string;
  email: string;
  phone: string;
  registrationStatus: string;
  attendanceStatus?: string;
  joinedAt?: string;
  leftAt?: string;
  duration?: number;
  isOnline: boolean;
}

interface Question {
  id: number;
  userId: number;
  userName: string;
  question: string;
  answer?: string;
  isAnswered: boolean;
  isPinned: boolean;
  createdAt: string;
}

const DoctorWebinarDashboard: React.FC = () => {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [selectedWebinar, setSelectedWebinar] = useState<Webinar | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [attendeesDialogOpen, setAttendeesDialogOpen] = useState(false);
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMyWebinars();
  }, [activeTab]);

  const fetchMyWebinars = async () => {
    try {
      setLoading(true);
      const params: any = { page: 1, limit: 50 };
      
      if (activeTab === 'upcoming') {
        params.status = 'scheduled';
      } else if (activeTab === 'live') {
        params.status = 'live';
      } else if (activeTab === 'past') {
        params.status = 'completed';
      }

      const response = await api.get('/api/doctor/webinars/my-webinars', { params });
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

  const handleStartWebinar = async (webinarId: number) => {
    navigate(`/doctor/webinar/${webinarId}/host`);
  };

  const handleEndWebinar = async (webinarId: number) => {
    if (!confirm('Are you sure you want to end this webinar?')) return;

    try {
      await api.post(`/api/doctor/webinars/${webinarId}/end`);
      toast({
        title: 'Success',
        description: 'Webinar ended successfully'
      });
      fetchMyWebinars();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to end webinar',
        variant: 'destructive'
      });
    }
  };

  const handleViewDetails = async (webinarId: number) => {
    try {
      const response = await api.get(`/api/doctor/webinars/${webinarId}`);
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

  const handleViewAttendees = async (webinarId: number) => {
    try {
      const response = await api.get(`/api/doctor/webinars/${webinarId}/attendees`);
      setAttendees(response.data.attendees);
      setAttendeesDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch attendees',
        variant: 'destructive'
      });
    }
  };

  const handleViewQuestions = async (webinarId: number) => {
    try {
      const response = await api.get(`/api/doctor/webinars/${webinarId}/questions`);
      setQuestions(response.data.questions);
      setQuestionsDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch questions',
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
      scheduled: { color: 'bg-blue-100 text-blue-800', text: 'Scheduled' },
      live: { color: 'bg-green-100 text-green-800 animate-pulse', text: 'Live' },
      completed: { color: 'bg-gray-100 text-gray-800', text: 'Completed' },
      cancelled: { color: 'bg-red-100 text-red-800', text: 'Cancelled' }
    };
    
    const variant = variants[status] || variants.scheduled;
    
    return (
      <Badge className={variant.color}>
        {variant.text}
      </Badge>
    );
  };

  const renderWebinarCard = (webinar: Webinar) => (
    <Card key={webinar.id} className="hover:shadow-lg transition-shadow">
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-semibold">{webinar.title}</h3>
              {getStatusBadge(webinar.status)}
            </div>
            <p className="text-gray-600 text-sm mb-4">{webinar.description}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{webinar.totalRegistrations}</div>
            <div className="text-xs text-gray-600">Registrations</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{webinar.approvedRegistrations}</div>
            <div className="text-xs text-gray-600">Approved</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{webinar.totalAttendees}</div>
            <div className="text-xs text-gray-600">Attended</div>
          </div>
          {webinar.peakConcurrentUsers !== undefined && (
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{webinar.peakConcurrentUsers}</div>
              <div className="text-xs text-gray-600">Peak Users</div>
            </div>
          )}
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
          {webinar.engagementScore !== undefined && (
            <div className="flex items-center gap-2 text-gray-600">
              <TrendingUp className="w-4 h-4" />
              <span>Engagement: {webinar.engagementScore}%</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {webinar.canStart && (
            <Button
              className="flex-1"
              onClick={() => handleStartWebinar(webinar.id)}
            >
              <Play className="w-4 h-4 mr-2" />
              Start Webinar
            </Button>
          )}
          
          {webinar.canEnd && (
            <Button
              className="flex-1"
              variant="destructive"
              onClick={() => handleEndWebinar(webinar.id)}
            >
              <Square className="w-4 h-4 mr-2" />
              End Webinar
            </Button>
          )}

          {webinar.status === 'live' && !webinar.canEnd && (
            <Button
              className="flex-1"
              onClick={() => navigate(`/doctor/webinar/${webinar.id}/host`)}
            >
              <Video className="w-4 h-4 mr-2" />
              Join Room
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => handleViewDetails(webinar.id)}
          >
            <Eye className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            onClick={() => handleViewAttendees(webinar.id)}
          >
            <Users className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            onClick={() => handleViewQuestions(webinar.id)}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">My Webinars</h1>
        <p className="text-gray-600 mt-1">Manage and host your webinars</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4 mt-6">
          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : webinars.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                No upcoming webinars
              </CardContent>
            </Card>
          ) : (
            webinars.map(renderWebinarCard)
          )}
        </TabsContent>

        <TabsContent value="live" className="space-y-4 mt-6">
          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : webinars.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                No live webinars
              </CardContent>
            </Card>
          ) : (
            webinars.map(renderWebinarCard)
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4 mt-6">
          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : webinars.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                No past webinars
              </CardContent>
            </Card>
          ) : (
            webinars.map(renderWebinarCard)
          )}
        </TabsContent>
      </Tabs>

      {/* Attendees Dialog */}
      <Dialog open={attendeesDialogOpen} onOpenChange={setAttendeesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attendees</DialogTitle>
            <DialogDescription>
              {attendees.length} total participants
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendees.map((attendee) => (
                  <TableRow key={attendee.id}>
                    <TableCell className="font-medium">{attendee.name}</TableCell>
                    <TableCell>{attendee.email}</TableCell>
                    <TableCell>
                      <Badge className={
                        attendee.isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }>
                        {attendee.isOnline ? 'Online' : attendee.registrationStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {attendee.attendanceStatus ? (
                        <Badge variant="outline">{attendee.attendanceStatus}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {attendee.duration ? `${Math.floor(attendee.duration / 60)} min` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button onClick={() => setAttendeesDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Questions Dialog */}
      <Dialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Q&A Questions</DialogTitle>
            <DialogDescription>
              {questions.length} questions submitted
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {questions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No questions yet</p>
            ) : (
              questions.map((q) => (
                <Card key={q.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">{q.userName}</span>
                          <span className="text-sm text-gray-500">
                            {new Date(q.createdAt).toLocaleString()}
                          </span>
                          {q.isAnswered && (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Answered
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-800 mb-2">{q.question}</p>
                        {q.answer && (
                          <div className="bg-blue-50 p-3 rounded-lg mt-2">
                            <p className="text-sm font-medium text-blue-900 mb-1">Your Answer:</p>
                            <p className="text-sm text-blue-800">{q.answer}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setQuestionsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorWebinarDashboard;
