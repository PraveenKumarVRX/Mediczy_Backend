import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Search, 
  Plus, 
  Clock, 
  User,
  Video,
  MapPin,
  Phone,
  MoreVertical,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Filter
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import api from '@/utils/api';

interface Appointment {
  id: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  doctorName: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  duration: string;
  type: 'video' | 'in-person';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled';
  reason?: string;
  notes?: string;
}

const AssistantAppointments = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: 'confirm' | 'cancel' | 'reschedule';
    appointment: Appointment | null;
  }>({ open: false, type: 'confirm', appointment: null });
  const [actionNote, setActionNote] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('assistantToken');
    if (!token) {
      navigate('/assistant/login');
      return;
    }
    fetchAppointments();
  }, [navigate, dateFilter]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/assistant/appointments', {
        params: { date: dateFilter }
      });
      if (data.success) {
        setAppointments(data.appointments);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      // Mock data
      const today = new Date().toISOString().split('T')[0];
      setAppointments([
        {
          id: 'APT001',
          patientName: 'Amit Sharma',
          patientPhone: '+91 98765 43210',
          patientEmail: 'amit@email.com',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          appointmentDate: today,
          appointmentTime: '10:00',
          duration: '30 min',
          type: 'video',
          status: 'confirmed',
          reason: 'Follow-up consultation'
        },
        {
          id: 'APT002',
          patientName: 'Priya Patel',
          patientPhone: '+91 91234 56789',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          appointmentDate: today,
          appointmentTime: '11:30',
          duration: '45 min',
          type: 'in-person',
          status: 'pending',
          reason: 'Annual checkup'
        },
        {
          id: 'APT003',
          patientName: 'Rajesh Kumar',
          patientPhone: '+91 87654 32109',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          appointmentDate: today,
          appointmentTime: '14:00',
          duration: '30 min',
          type: 'video',
          status: 'pending',
          reason: 'New patient consultation'
        },
        {
          id: 'APT004',
          patientName: 'Sunita Devi',
          patientPhone: '+91 76543 21098',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          appointmentDate: today,
          appointmentTime: '15:30',
          duration: '30 min',
          type: 'in-person',
          status: 'confirmed',
          reason: 'Prescription renewal'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredAppointments = appointments.filter(apt => {
    const matchesSearch = apt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         apt.patientPhone.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || apt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAction = async () => {
    if (!actionDialog.appointment) return;
    
    const { type, appointment } = actionDialog;
    
    try {
      if (type === 'confirm') {
        await api.post(`/assistant/consultations/${appointment.id}/accept`);
        setAppointments(prev => prev.map(a => 
          a.id === appointment.id ? { ...a, status: 'confirmed' } : a
        ));
        toast.success('Appointment confirmed');
      } else if (type === 'cancel') {
        await api.post(`/assistant/consultations/${appointment.id}/cancel`, { reason: actionNote });
        setAppointments(prev => prev.map(a => 
          a.id === appointment.id ? { ...a, status: 'cancelled' } : a
        ));
        toast.success('Appointment cancelled');
      } else if (type === 'reschedule') {
        await api.post(`/assistant/consultations/${appointment.id}/postpone`, {
          appointmentDate: newDate,
          appointmentTime: newTime,
          note: actionNote
        });
        setAppointments(prev => prev.map(a => 
          a.id === appointment.id ? { 
            ...a, 
            status: 'rescheduled',
            appointmentDate: newDate,
            appointmentTime: newTime
          } : a
        ));
        toast.success('Appointment rescheduled');
      }
    } catch (error) {
      toast.error('Action failed. Please try again.');
    }
    
    setActionDialog({ open: false, type: 'confirm', appointment: null });
    setActionNote('');
    setNewDate('');
    setNewTime('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-700 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      case 'rescheduled': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const pendingCount = appointments.filter(a => a.status === 'pending').length;
  const confirmedCount = appointments.filter(a => a.status === 'confirmed').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6 text-purple-600" />
              Appointments
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage doctor appointments and patient schedules
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => fetchAppointments()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button 
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => {
                const patientName = prompt('Patient name?');
                if (patientName) toast.success(`Creating appointment for ${patientName}`);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{appointments.length}</p>
                <p className="text-sm text-muted-foreground">Total Today</p>
              </div>
            </CardContent>
          </Card>
          <Card className={pendingCount > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Confirmation</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{confirmedCount}</p>
                <p className="text-sm text-muted-foreground">Confirmed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">
                  {appointments.filter(a => a.type === 'video').length}
                </p>
                <p className="text-sm text-muted-foreground">Video Consultations</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Appointments List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {dateFilter === 'today' ? "Today's Schedule" : 'Appointments'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground">No appointments found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAppointments.map((apt) => (
                  <Card key={apt.id} className={`hover:shadow-md transition-shadow border-l-4 ${
                    apt.status === 'pending' ? 'border-l-yellow-500' : 
                    apt.status === 'confirmed' ? 'border-l-green-500' : 
                    'border-l-gray-300'
                  }`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-full ${
                            apt.type === 'video' ? 'bg-blue-100' : 'bg-green-100'
                          }`}>
                            {apt.type === 'video' ? (
                              <Video className="h-5 w-5 text-blue-600" />
                            ) : (
                              <MapPin className="h-5 w-5 text-green-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-lg">{apt.patientName}</p>
                              <Badge className={getStatusColor(apt.status)}>
                                {apt.status}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {apt.appointmentTime} • {apt.duration}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {apt.patientPhone}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {apt.doctorName}
                              </span>
                            </div>
                            {apt.reason && (
                              <p className="text-sm mt-2 text-muted-foreground">
                                Reason: {apt.reason}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {apt.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-200 hover:bg-green-50"
                                onClick={() => setActionDialog({ open: true, type: 'confirm', appointment: apt })}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Confirm
                              </Button>
                            </>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => setActionDialog({ open: true, type: 'reschedule', appointment: apt })}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reschedule
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => setActionDialog({ open: true, type: 'cancel', appointment: apt })}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Cancel
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.info('Calling patient...')}>
                                <Phone className="h-4 w-4 mr-2" />
                                Call Patient
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Dialog */}
        <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionDialog.type === 'confirm' && 'Confirm Appointment'}
                {actionDialog.type === 'cancel' && 'Cancel Appointment'}
                {actionDialog.type === 'reschedule' && 'Reschedule Appointment'}
              </DialogTitle>
              <DialogDescription>
                {actionDialog.appointment && (
                  <span>
                    Patient: <strong>{actionDialog.appointment.patientName}</strong> at{' '}
                    <strong>{actionDialog.appointment.appointmentTime}</strong>
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {actionDialog.type === 'reschedule' && (
              <div className="grid gap-4 py-4">
                <div>
                  <label className="text-sm font-medium">New Date</label>
                  <Input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">New Time</label>
                  <Input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            
            {(actionDialog.type === 'cancel' || actionDialog.type === 'reschedule') && (
              <div>
                <label className="text-sm font-medium">
                  {actionDialog.type === 'cancel' ? 'Reason for cancellation' : 'Note (optional)'}
                </label>
                <Textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={actionDialog.type === 'cancel' ? 'Enter reason...' : 'Add a note...'}
                  className="mt-1"
                />
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog({ open: false, type: 'confirm', appointment: null })}>
                Cancel
              </Button>
              <Button 
                onClick={handleAction}
                className={actionDialog.type === 'cancel' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                {actionDialog.type === 'confirm' && 'Confirm Appointment'}
                {actionDialog.type === 'cancel' && 'Cancel Appointment'}
                {actionDialog.type === 'reschedule' && 'Reschedule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AssistantAppointments;
