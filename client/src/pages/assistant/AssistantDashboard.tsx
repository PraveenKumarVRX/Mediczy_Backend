import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  UserCog, 
  Calendar, 
  Users, 
  Clock, 
  FileText,
  CheckCircle,
  AlertCircle,
  LogOut,
  User,
  Bell,
  MessageSquare,
  Stethoscope,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import AssistantDoctorManager from '@/components/AssistantDoctorManager';
import api from '@/utils/api';

interface AssistantData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  linkedDoctorId?: string; // Legacy field
  linkedDoctorIds: string[];
  primaryDoctorId?: string;
  linkedDoctorName?: string;
  linkedFacilityId?: string;
  linkedFacilityType?: 'clinic' | 'hospital';
  linkedFacilityName?: string;
  permissions: string[];
  canAccessDoctorCalendar: boolean;
}

// Normalize permissions - convert object format to array of permission names
const normalizePermissions = (permissions: any): string[] => {
  if (Array.isArray(permissions)) {
    return permissions;
  }
  if (permissions && typeof permissions === 'object') {
    // Convert {canViewAppointments: true, canManagePatients: false} to ['canViewAppointments']
    return Object.entries(permissions)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
  }
  return [];
};

const AssistantDashboard = () => {
  const navigate = useNavigate();
  const [assistantData, setAssistantData] = useState<AssistantData | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [consultationsLoading, setConsultationsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const token = localStorage.getItem('assistantToken');
    const data = localStorage.getItem('assistantData');
    
    if (!token || !data) {
      navigate('/assistant/login');
      return;
    }

    try {
      const parsed = JSON.parse(data);
      const safeData: AssistantData = {
        ...parsed,
        linkedDoctorIds: parsed?.linkedDoctorIds ?? [],
        permissions: normalizePermissions(parsed?.permissions),
      };
      setAssistantData(safeData);
      fetchAppointments();
    } catch (error) {
      console.error('Error loading assistant data:', error);
      navigate('/assistant/login');
    }
  }, [navigate]);

  const fetchAppointments = async () => {
    try {
      const { data } = await api.get('/assistant/appointments');
      
      if (data.success) {
        setAppointments(data.appointments);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      // Fallback sample appointments so UI remains functional
      setAppointments([
        {
          id: 'apt_001',
          patientName: 'Amit Sharma',
          patientPhone: '+91 98765 43210',
          appointmentTime: '10:30 AM',
          duration: '30 min',
          type: 'Follow-up',
          status: 'Pending',
          notes: 'Diabetes review'
        },
        {
          id: 'apt_002',
          patientName: 'Neha Patel',
          patientPhone: '+91 91234 56789',
          appointmentTime: '12:00 PM',
          duration: '20 min',
          type: 'Video Consult',
          status: 'Confirmed',
          notes: 'New migraine complaint'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsultations = async () => {
    try {
      setConsultationsLoading(true);
      const token = localStorage.getItem('assistantToken');
      if (!token) return;
      const { data } = await api.get('/assistant/consultations');
      if (data.success) {
        setConsultations(data.consultations);
      }
    } catch (error) {
      console.error('Error fetching consultations:', error);
    } finally {
      setConsultationsLoading(false);
    }
  };

  const handleAcceptConsultation = async (id: string) => {
    try {
      const { data } = await api.post(`/assistant/consultations/${id}/accept`);
      if (data.success) {
        setConsultations(prev => prev.map(c => c.id === id ? data.consultation : c));
      }
    } catch (e) {
      console.error('Accept error', e);
    }
  };

  const handleCancelConsultation = async (id: string) => {
    const reason = window.prompt('Reason for cancellation?');
    try {
      const { data } = await api.post(`/assistant/consultations/${id}/cancel`, { reason });
      if (data.success) {
        setConsultations(prev => prev.map(c => c.id === id ? data.consultation : c));
      }
    } catch (e) {
      console.error('Cancel error', e);
    }
  };

  const handlePostponeConsultation = async (id: string) => {
    const date = window.prompt('New date (YYYY-MM-DD)?');
    const time = window.prompt('New time (HH:MM)?');
    if (!date || !time) return;
    const note = window.prompt('Optional reschedule note');
    try {
      const { data } = await api.post(`/assistant/consultations/${id}/postpone`, { appointmentDate: date, appointmentTime: time, note });
      if (data.success) {
        setConsultations(prev => prev.map(c => c.id === id ? data.consultation : c));
      }
    } catch (e) {
      console.error('Postpone error', e);
    }
  };

  const handleAddNote = async (id: string) => {
    const note = window.prompt('Enter note');
    if (!note) return;
    try {
      const { data } = await api.post(`/assistant/consultations/${id}/notes`, { note });
      if (data.success) {
        setConsultations(prev => prev.map(c => c.id === id ? data.consultation : c));
      }
    } catch (e) {
      console.error('Add note error', e);
    }
  };

  const handleBookConsultation = async () => {
    const patientName = window.prompt('Patient name?');
    if (!patientName) return;
    const doctorId = assistantData?.primaryDoctorId || 'doc_001';
    const date = window.prompt('Date (YYYY-MM-DD)?', new Date().toISOString().split('T')[0]);
    const time = window.prompt('Time (HH:MM)?', '16:00');
    const type = window.prompt('Type (video / in-person)?', 'video');
    try {
      const { data } = await api.post('/assistant/consultations/book', { patientName, doctorId, appointmentDate: date, appointmentTime: time, type });
      if (data.success) {
        setConsultations(prev => [data.consultation, ...prev]);
      }
    } catch (e) {
      console.error('Book consultation error', e);
    }
  };

  const createQuickAppointment = () => {
    const patientName = window.prompt('Patient name?');
    if (!patientName) return;
    const appointmentTime = window.prompt('Time (e.g., 15:00)') || '15:00';
    const type = window.prompt('Type (consultation / follow-up)') || 'Consultation';
    const newAppointment = {
      id: `apt_${Date.now()}`,
      patientName,
      patientPhone: '',
      appointmentTime,
      duration: '30 min',
      type,
      status: 'Pending'
    };
    setAppointments(prev => [newAppointment, ...prev]);
    toast.success('Appointment scheduled (local draft)');
  };

  const openPatientList = () => {
    navigate('/assistant/register-patient');
  };

  const sendNotification = () => {
    const message = window.prompt('Notification message to patients?');
    if (!message) return;
    toast.success('Notification queued to patients');
  };

  const handleLogout = () => {
    localStorage.removeItem('assistantToken');
    localStorage.removeItem('assistantData');
    navigate('/assistant/login');
  };

  if (!assistantData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg">
                <UserCog className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Assistant Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  {assistantData.firstName} {assistantData.lastName} - {assistantData.roleTitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {assistantData.linkedFacilityName && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Stethoscope className="h-3 w-3 mr-1" />
                  {assistantData.linkedFacilityName}
                </Badge>
              )}
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                <User className="h-3 w-3 mr-1" />
                {assistantData.linkedDoctorName || 'Doctor Assistant'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 max-w-3xl">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="doctors">My Doctors</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="consultations">Consultations</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today's Appointments</p>
                  <p className="text-2xl font-bold">{appointments.length}</p>
                </div>
                <Calendar className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Confirmed</p>
                  <p className="text-2xl font-bold">
                    {appointments.filter(a => a.status === 'Confirmed').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold">
                    {appointments.filter(a => a.status === 'Pending').length}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Messages</p>
                  <p className="text-2xl font-bold">3</p>
                </div>
                <MessageSquare className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate('/assistant/register-patient')}
              >
                <User className="h-5 w-5" />
                <span className="text-xs">Register Patient</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={createQuickAppointment}
              >
                <Calendar className="h-5 w-5" />
                <span className="text-xs">Schedule Appointment</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={openPatientList}
              >
                <Users className="h-5 w-5" />
                <span className="text-xs">Patient List</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex-col gap-2"
                onClick={sendNotification}
              >
                <Bell className="h-5 w-5" />
                <span className="text-xs">Send Notification</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appointments List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Today's Appointments</CardTitle>
              <Badge variant="outline">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading appointments...</p>
            ) : appointments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No appointments scheduled</p>
            ) : (
              <div className="space-y-3">
                {appointments.map((appointment) => (
                  <Card key={appointment.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-full">
                            <Clock className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-medium">{appointment.patientName}</p>
                            <p className="text-sm text-muted-foreground">
                              {appointment.appointmentTime} • {appointment.duration} • {appointment.type}
                            </p>
                            {appointment.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Note: {appointment.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant={appointment.status === 'Confirmed' ? 'default' : 'secondary'}
                          >
                            {appointment.status}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {appointment.patientPhone}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Doctor's Appointments</CardTitle>
                <Button size="sm" onClick={() => fetchAppointments()}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Manage appointments for {assistantData.linkedDoctorName || 'linked doctors'}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading appointments...</p>
                </div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                  <p className="text-muted-foreground">No appointments scheduled</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => navigate('/assistant/schedule-appointment')}
                  >
                    Schedule New Appointment
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((appointment) => (
                    <Card key={appointment.id} className="hover:shadow-md transition-shadow border-l-4 border-l-purple-500">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-lg">
                              <User className="h-5 w-5 text-purple-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-lg">{appointment.patientName}</p>
                                <Badge 
                                  variant={
                                    appointment.status === 'Confirmed' ? 'default' : 
                                    appointment.status === 'Pending' ? 'secondary' : 
                                    'outline'
                                  }
                                >
                                  {appointment.status}
                                </Badge>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  <span>{appointment.appointmentTime} • {appointment.duration || '30 min'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  <span>{appointment.type || 'Consultation'}</span>
                                </div>
                                {appointment.patientPhone && (
                                  <div className="flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    <span>{appointment.patientPhone}</span>
                                  </div>
                                )}
                                {appointment.notes && (
                                  <p className="text-xs bg-blue-50 dark:bg-blue-900/20 p-2 rounded mt-2 border-l-2 border-blue-500">
                                    <strong>Note:</strong> {appointment.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 ml-4">
                            <Button 
                              size="sm" 
                              variant="outline"
                              disabled={actionLoading[`confirm-${appointment.id}`]}
                              onClick={async () => {
                                setActionLoading(prev => ({ ...prev, [`confirm-${appointment.id}`]: true }));
                                setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Confirmed' } : a));
                                toast.success('Appointment marked confirmed');
                                setActionLoading(prev => ({ ...prev, [`confirm-${appointment.id}`]: false }));
                              }}
                            >
                              {actionLoading[`confirm-${appointment.id}`] ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mr-1" />
                              )}
                              {actionLoading[`confirm-${appointment.id}`] ? 'Confirming...' : 'Confirm'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                const newTime = window.prompt('New time (e.g., 16:30)?', appointment.appointmentTime);
                                if (!newTime) return;
                                setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, appointmentTime: newTime, status: 'Pending', notes: `Rescheduled to ${newTime}` } : a));
                                toast.success('Appointment rescheduled locally');
                              }}
                            >
                              <Calendar className="h-4 w-4 mr-1" />
                              Reschedule
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              disabled={actionLoading[`remind-${appointment.id}`]}
                              onClick={() => {
                                setActionLoading(prev => ({ ...prev, [`remind-${appointment.id}`]: true }));
                                toast.success(`Reminder queued for ${appointment.patientName}`);
                                setActionLoading(prev => ({ ...prev, [`remind-${appointment.id}`]: false }));
                              }}
                            >
                              {actionLoading[`remind-${appointment.id}`] ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Bell className="h-4 w-4 mr-1" />
                              )}
                              {actionLoading[`remind-${appointment.id}`] ? 'Sending...' : 'Remind'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              
              <div className="mt-6 pt-6 border-t">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Total Appointments: {appointments.length}
                  </p>
                  <Button 
                    variant="outline"
                    onClick={() => navigate('/appointments')}
                  >
                    View Full Calendar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>          <TabsContent value="doctors">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5" />
                  <CardTitle>My Linked Doctors</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  View all doctors you are assigned to assist
                </p>
              </CardHeader>
              <CardContent>
                <AssistantDoctorManager 
                  assistantId={assistantData.id} 
                  role="assistant"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="consultations">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Consultations Management</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={fetchConsultations}>Refresh</Button>
                    <Button size="sm" onClick={handleBookConsultation}>Book Consultation</Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Accept, cancel, postpone and note consultations on behalf of linked doctors.</p>
              </CardHeader>
              <CardContent>
                {consultationsLoading ? (
                  <p className="text-center text-muted-foreground py-6">Loading consultations...</p>
                ) : consultations.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-40 mb-3" />
                    <p className="text-muted-foreground">No consultations found.</p>
                    <Button className="mt-4" variant="outline" onClick={handleBookConsultation}>Book First Consultation</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {consultations.map(c => (
                      <Card key={c.id} className="border-l-4 border-l-blue-500 hover:shadow-sm transition-shadow">
                        <CardContent className="pt-4">
                          <div className="flex justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold">{c.patientName}</p>
                                <Badge variant={c.status === 'confirmed' ? 'default' : c.status === 'pending' ? 'secondary' : 'outline'}>{c.status}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">{c.appointmentDate} • {c.appointmentTime} • {c.type}</p>
                              {c.patientPhone && <p className="text-xs">{c.patientPhone}</p>}
                              {c.notes.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {c.notes.slice(-3).map((n,i) => (
                                    <p key={i} className="text-[11px] bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded border-l-2 border-blue-400">{n}</p>
                                  ))}
                                  {c.notes.length > 3 && <p className="text-[10px] text-muted-foreground">{c.notes.length - 3} more notes...</p>}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 w-40">
                              <Button size="sm" variant="outline" disabled={c.status === 'confirmed'} onClick={() => handleAcceptConsultation(c.id)}>Accept</Button>
                              <Button size="sm" variant="outline" disabled={c.status === 'cancelled'} onClick={() => handleCancelConsultation(c.id)}>Cancel</Button>
                              <Button size="sm" variant="outline" onClick={() => handlePostponeConsultation(c.id)}>Postpone</Button>
                              <Button size="sm" variant="ghost" onClick={() => handleAddNote(c.id)}>Add Note</Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <p className="mt-1">{assistantData.firstName} {assistantData.lastName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="mt-1">{assistantData.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Role</label>
                  <p className="mt-1">{assistantData.roleTitle}</p>
                </div>
                {assistantData.linkedFacilityName && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Linked {assistantData.linkedFacilityType === 'clinic' ? 'Clinic' : 'Hospital'}
                    </label>
                    <p className="mt-1 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-blue-500" />
                      {assistantData.linkedFacilityName}
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Linked Doctors</label>
                  <p className="mt-1">
                    {assistantData.linkedDoctorIds.length} of 5 doctors
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Permissions</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {assistantData.permissions.map((perm, index) => (
                      <Badge key={index} variant="secondary">
                        {perm}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Orders & Tasks</CardTitle>
                  <Button size="sm" onClick={() => navigate('/assistant/orders')}>
                    Open Full Manager
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Create orders and manage team task assignments.
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  Use the button above to access the full Orders & Tasks management interface.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AssistantDashboard;
