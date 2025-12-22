import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Calendar,
  Clock,
  User,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  Info,
  Monitor,
  Smartphone,
  Loader2,
  CheckCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';
import { format } from 'date-fns';

interface Appointment {
  id: string;
  doctorId: string;
  doctorName: string;
  specialization: string;
  date: string;
  time: string;
  consultationType: string;
  status: string;
  meetingLink?: string;
  roomId?: string;
}

const VideoConsultation = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [roomId, setRoomId] = useState(searchParams.get('room') || "");
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch upcoming video consultations
  const { data: upcomingAppointments = [], isLoading } = useQuery({
    queryKey: ['patient-video-consultations', currentUser?._id],
    queryFn: async () => {
      try {
        const response = await api.get('/appointments', {
          params: {
            userId: currentUser?._id,
            consultationType: 'online',
            status: 'confirmed'
          }
        });
        return response.data.appointments || [];
      } catch (err: any) {
        console.error('Failed to fetch video consultations:', err);
        return [];
      }
    },
    enabled: !!currentUser?._id,
  });

  const handleJoinMeeting = (appointment: Appointment) => {
    if (appointment.meetingLink) {
      // Open MiroTalk in new tab
      window.open(appointment.meetingLink, '_blank');
      
      toast({
        title: "Joining Video Call",
        description: `Connecting to Dr. ${appointment.doctorName}`,
      });
    } else if (appointment.roomId) {
      // Construct MiroTalk link
      const baseUrl = import.meta.env.VITE_MIROTALK_URL || 'http://mediqzy.com:3010';
      const meetingUrl = `${baseUrl}/join/${appointment.roomId}?name=${encodeURIComponent(currentUser?.name || 'Patient')}`;
      window.open(meetingUrl, '_blank');
    } else {
      toast({
        variant: "destructive",
        title: "No Meeting Link",
        description: "Please contact support to get your meeting link.",
      });
    }
  };

  const handleJoinWithCode = () => {
    if (!roomId.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a valid room code",
      });
      return;
    }

    const baseUrl = import.meta.env.VITE_MIROTALK_URL || 'http://mediqzy.com:3010';
    const meetingUrl = `${baseUrl}/join/${roomId}?name=${encodeURIComponent(currentUser?.name || 'Patient')}`;
    window.open(meetingUrl, '_blank');
    
    toast({
      title: "Joining Meeting",
      description: "Opening video consultation...",
    });
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast({
      title: "Link Copied",
      description: "Meeting link copied to clipboard",
    });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const isUpcoming = (date: string, time: string) => {
    const appointmentDate = new Date(`${date} ${time}`);
    const now = new Date();
    const fifteenMinsBefore = new Date(appointmentDate.getTime() - 15 * 60000);
    return now >= fifteenMinsBefore && now <= appointmentDate;
  };

  const upcomingAppointmentsFiltered = upcomingAppointments.filter((apt: Appointment) => 
    isUpcoming(apt.date, apt.time)
  );

  return (
    <MainLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold primary-grad mb-2">
              Video Consultations
            </h1>
            <p className="text-muted-foreground">
              Join your scheduled video appointments with doctors
            </p>
          </div>

          {/* Quick Join Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Quick Join
              </CardTitle>
              <CardDescription>
                Have a meeting code? Enter it below to join instantly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="roomId">Meeting Code / Room ID</Label>
                  <Input
                    id="roomId"
                    placeholder="Enter meeting code..."
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleJoinWithCode()}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleJoinWithCode} className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Join Meeting
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Appointments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Video Consultations
              </CardTitle>
              <CardDescription>
                Your scheduled online appointments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="h-12 w-12 bg-muted rounded-full animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                        <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                      </div>
                      <div className="h-10 w-32 bg-muted rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : upcomingAppointmentsFiltered.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Upcoming Consultations</h3>
                  <p className="text-muted-foreground mb-4">
                    You don't have any scheduled video consultations
                  </p>
                  <Button onClick={() => navigate('/appointments')}>
                    Book Appointment
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingAppointmentsFiltered.map((appointment: Appointment) => {
                    const appointmentDateTime = new Date(`${appointment.date} ${appointment.time}`);
                    const canJoin = isUpcoming(appointment.date, appointment.time);

                    return (
                      <div
                        key={appointment.id}
                        className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border rounded-lg hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{appointment.doctorName}</h3>
                            <p className="text-sm text-muted-foreground">{appointment.specialization}</p>
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {format(appointmentDateTime, 'MMM dd, yyyy')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {format(appointmentDateTime, 'hh:mm a')}
                              </span>
                            </div>
                            {appointment.meetingLink && (
                              <div className="flex items-center gap-2 mt-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopyLink(appointment.meetingLink!)}
                                  className="h-8 px-2"
                                >
                                  {copiedLink ? (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                                <span className="text-xs text-muted-foreground truncate max-w-md">
                                  {appointment.meetingLink}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                          {canJoin ? (
                            <>
                              <Button
                                onClick={() => handleJoinMeeting(appointment)}
                                className="gap-2 bg-green-600 hover:bg-green-700"
                                size="lg"
                              >
                                <Video className="h-5 w-5" />
                                Join Now
                              </Button>
                              <Badge variant="secondary" className="bg-green-100 text-green-700 justify-center">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Ready to Join
                              </Badge>
                            </>
                          ) : (
                            <>
                              <Button
                                onClick={() => handleJoinMeeting(appointment)}
                                variant="outline"
                                className="gap-2"
                              >
                                <ExternalLink className="h-4 w-4" />
                                View Link
                              </Button>
                              <Badge variant="secondary" className="justify-center">
                                Scheduled
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* All Scheduled Consultations */}
          <Card>
            <CardHeader>
              <CardTitle>All Scheduled Consultations</CardTitle>
              <CardDescription>View all your online consultation appointments</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : upcomingAppointments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No scheduled consultations
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingAppointments.map((apt: Appointment) => (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{apt.doctorName}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(`${apt.date} ${apt.time}`), 'MMM dd, yyyy - hh:mm a')}
                        </p>
                      </div>
                      <Badge>{apt.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* System Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                System Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Supported Browsers
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Chrome (Recommended)</li>
                    <li>• Firefox</li>
                    <li>• Safari</li>
                    <li>• Edge</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Required Permissions
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Camera access</li>
                    <li>• Microphone access</li>
                    <li>• Stable internet connection</li>
                  </ul>
                </div>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> Join 5-10 minutes before your appointment time to test your camera and microphone.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default VideoConsultation;
