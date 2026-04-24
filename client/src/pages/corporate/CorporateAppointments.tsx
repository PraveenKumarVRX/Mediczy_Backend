import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, MapPin, Search, Filter, Plus, CheckCircle, XCircle, AlertCircle, Users, RefreshCw, CalendarCheck, Eye, Edit2, Ban, RotateCcw } from 'lucide-react';
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

interface Appointment {
  id: string;
  employeeName: string;
  employeeId: string;
  department: string;
  appointmentType: string;
  doctorName: string;
  facility: string;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  department: string;
}

const sampleEmployees: EmployeeOption[] = [
  { id: 'EMP001', name: 'John Smith', department: 'Engineering' },
  { id: 'EMP002', name: 'Emily Davis', department: 'Marketing' },
  { id: 'EMP003', name: 'Robert Wilson', department: 'Finance' },
];

const sampleAppointments: Appointment[] = [
  {
    id: 'APT001',
    employeeName: 'John Smith',
    employeeId: 'EMP001',
    department: 'Engineering',
    appointmentType: 'Annual Health Checkup',
    doctorName: 'Dr. Sarah Johnson',
    facility: 'City Medical Center',
    date: '2024-01-15',
    time: '10:00 AM',
    status: 'scheduled',
    notes: 'Regular annual checkup as per company policy'
  },
  {
    id: 'APT002',
    employeeName: 'Emily Davis',
    employeeId: 'EMP002',
    department: 'Marketing',
    appointmentType: 'Dental Checkup',
    doctorName: 'Dr. Michael Brown',
    facility: 'Dental Care Plus',
    date: '2024-01-14',
    time: '02:30 PM',
    status: 'completed',
    notes: 'Completed without issues'
  },
  {
    id: 'APT003',
    employeeName: 'Robert Wilson',
    employeeId: 'EMP003',
    department: 'Finance',
    appointmentType: 'Eye Examination',
    doctorName: 'Dr. Lisa Anderson',
    facility: 'Vision Care Clinic',
    date: '2024-01-13',
    time: '11:00 AM',
    status: 'cancelled',
    notes: 'Employee requested cancellation'
  },
  {
    id: 'APT004',
    employeeName: 'Maria Garcia',
    employeeId: 'EMP004',
    department: 'HR',
    appointmentType: 'Mental Health Consultation',
    doctorName: 'Dr. James Taylor',
    facility: 'Wellness Counseling Center',
    date: '2024-01-16',
    time: '03:00 PM',
    status: 'scheduled',
    notes: 'Confidential session'
  },
  {
    id: 'APT005',
    employeeName: 'David Lee',
    employeeId: 'EMP005',
    department: 'Operations',
    appointmentType: 'Vaccination',
    doctorName: 'Dr. Patricia White',
    facility: 'City Medical Center',
    date: '2024-01-12',
    time: '09:00 AM',
    status: 'no-show',
    notes: 'Did not attend scheduled appointment'
  }
];

const CorporateAppointments: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>(sampleEmployees);
  const [isLoading, setIsLoading] = useState(false);

  const stats = {
    totalScheduled: appointments.filter(a => a.status === 'scheduled').length,
    completedThisMonth: appointments.filter(a => a.status === 'completed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
    noShows: appointments.filter(a => a.status === 'no-show').length
  };

  const filteredAppointments = useMemo(() => appointments.filter(appointment => {
    const matchesSearch = 
      appointment.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.appointmentType.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }), [appointments, searchQuery, statusFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500/15 text-blue-400';
      case 'completed':
        return 'bg-emerald-500/15 text-emerald-400';
      case 'cancelled':
        return 'bg-slate-700/50 text-slate-400';
      case 'no-show':
        return 'bg-red-500/15 text-red-400';
      default:
        return 'bg-slate-700/50 text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Clock className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4" />;
      case 'no-show':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const [appointmentForm, setAppointmentForm] = useState({
    employeeId: '',
    employeeName: '',
    department: '',
    appointmentType: '',
    doctorName: '',
    facility: '',
    date: '',
    time: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAppointments = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/appointments');
      const list = ((data as any)?.data?.appointments || []) as Appointment[];
      setAppointments(list);
    } catch (error: any) {
      setAppointments(sampleAppointments);
      toast({
        title: 'Failed to load appointments',
        description: error?.response?.data?.message || 'Showing sample appointments.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const { data } = await api.get('/corporate/employees');
      const list = ((data as any)?.data?.employees || []) as any[];
      const mapped = list
        .map((emp) => ({
          id: emp.employeeId || emp.id,
          name: emp.name,
          department: emp.department || 'General'
        }))
        .filter((emp) => emp.id && emp.name);
      setEmployeeOptions(mapped.length ? mapped : sampleEmployees);
    } catch (error) {
      setEmployeeOptions(sampleEmployees);
    }
  };

  useEffect(() => {
    loadAppointments();
    loadEmployees();
  }, []);

  const handleEmployeeSelect = (employeeId: string) => {
    const selected = employeeOptions.find((emp) => emp.id === employeeId);
    setAppointmentForm((prev) => ({
      ...prev,
      employeeId,
      employeeName: selected?.name || prev.employeeName,
      department: selected?.department || prev.department
    }));
  };

  const handleScheduleAppointment = async () => {
    if (!appointmentForm.employeeId || !appointmentForm.appointmentType || !appointmentForm.date || !appointmentForm.time) {
      toast({
        title: "Missing fields",
        description: "Please fill in employee, appointment type, date, and time.",
        variant: "destructive"
      });
      return;
    }
    try {
      setIsSubmitting(true);
      const { data } = await api.post('/corporate/appointments', appointmentForm);
      const newAppointment = (data as any)?.data?.appointment;
      if (newAppointment) {
        setAppointments(prev => [newAppointment, ...prev]);
      } else {
        await loadAppointments();
      }
      toast({
        title: "Appointment Scheduled",
        description: "The appointment has been scheduled successfully."
      });
      setIsScheduleDialogOpen(false);
      setAppointmentForm({
        employeeId: '', employeeName: '', department: '', appointmentType: '',
        doctorName: '', facility: '', date: '', time: '', notes: ''
      });
    } catch (error: any) {
      toast({
        title: "Scheduling failed",
        description: error?.response?.data?.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDetails = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsDetailsOpen(true);
  };

  const handleCancel = (appointment: Appointment) => {
    if (!window.confirm(`Cancel appointment ${appointment.id} for ${appointment.employeeName}?`)) return;
    setAppointments((prev) => prev.map((a) => a.id === appointment.id ? { ...a, status: 'cancelled', notes: 'Cancelled by admin' } : a));
    toast({ title: 'Appointment cancelled', description: `${appointment.employeeName}'s appointment was cancelled.` });
  };

  const handleReschedule = (appointment: Appointment) => {
    const newDate = window.prompt('Enter new date (YYYY-MM-DD)', appointment.date);
    const newTime = window.prompt('Enter new time (e.g., 09:30 AM)', appointment.time);
    if (!newDate || !newTime) {
      toast({ title: 'Reschedule cancelled', description: 'No changes were made.' });
      return;
    }
    setAppointments((prev) => prev.map((a) => a.id === appointment.id ? { ...a, date: newDate, time: newTime, status: 'scheduled' } : a));
    toast({ title: 'Appointment rescheduled', description: `${appointment.employeeName} moved to ${newDate} at ${newTime}.` });
  };

  const handleMarkCompleted = (appointment: Appointment) => {
    setAppointments((prev) => prev.map((a) => a.id === appointment.id ? { ...a, status: 'completed' } : a));
    toast({ title: 'Marked as completed', description: `${appointment.employeeName}'s appointment marked completed.` });
  };

  const handleRefresh = () => {
    loadAppointments();
    toast({ title: 'Appointments refreshed', description: 'Showing the latest appointment list.' });
  };

  return (
    <CorporateLayout title="Corporate Appointments">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={CalendarCheck}
          title="Corporate Appointments"
          description="Manage employee health appointments, checkups, and consultations"
          gradient="from-purple-500 to-purple-700"
          badge={`${appointments.length} Total`}
          showSearch={true}
          searchPlaceholder="Search by employee name, ID, or department..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showRefresh={true}
          onRefresh={handleRefresh}
          isRefreshing={isLoading}
          stats={[
            { label: 'Scheduled', value: stats.totalScheduled },
            { label: 'Completed', value: stats.completedThisMonth },
            { label: 'Cancelled', value: stats.cancelled },
            { label: 'No Shows', value: stats.noShows },
          ]}
          showAdd={true}
          addLabel="Schedule Appointment"
          onAdd={() => setIsScheduleDialogOpen(true)}
        />

        {/* Schedule Dialog */}
        <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Schedule New Appointment</DialogTitle>
              <DialogDescription>
                Schedule a health appointment for an employee
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="employee">Employee</Label>
                <Select value={appointmentForm.employeeId} onValueChange={handleEmployeeSelect}>
                  <SelectTrigger id="employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeOptions.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} - {emp.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Appointment Type</Label>
                <Select
                  value={appointmentForm.appointmentType}
                  onValueChange={(value) => setAppointmentForm((prev) => ({ ...prev, appointmentType: value }))}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Annual Health Checkup">Annual Health Checkup</SelectItem>
                    <SelectItem value="Dental Checkup">Dental Checkup</SelectItem>
                    <SelectItem value="Eye Examination">Eye Examination</SelectItem>
                    <SelectItem value="Mental Health Consultation">Mental Health Consultation</SelectItem>
                    <SelectItem value="Vaccination">Vaccination</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="facility">Facility</Label>
                <Select
                  value={appointmentForm.facility}
                  onValueChange={(value) => setAppointmentForm((prev) => ({ ...prev, facility: value }))}
                >
                  <SelectTrigger id="facility">
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="City Medical Center">City Medical Center</SelectItem>
                    <SelectItem value="Dental Care Plus">Dental Care Plus</SelectItem>
                    <SelectItem value="Vision Care Clinic">Vision Care Clinic</SelectItem>
                    <SelectItem value="Wellness Counseling Center">Wellness Counseling Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={appointmentForm.date}
                    onChange={(e) => setAppointmentForm((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={appointmentForm.time}
                    onChange={(e) => setAppointmentForm((prev) => ({ ...prev, time: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any relevant notes..."
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleScheduleAppointment}>Schedule Appointment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalScheduled}</div>
            <p className="text-xs text-muted-foreground">Upcoming appointments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedThisMonth}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cancelled}</div>
            <p className="text-xs text-muted-foreground">Cancellations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">No Shows</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.noShows}</div>
            <p className="text-xs text-muted-foreground">Missed appointments</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Appointment Management</CardTitle>
          <CardDescription>View and manage all employee appointments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by employee, ID, department, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no-show">No Show</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Appointments List */}
          <div className="space-y-4">
            {filteredAppointments.map((appointment) => (
              <Card key={appointment.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{appointment.employeeName}</h3>
                        <Badge variant="outline">{appointment.employeeId}</Badge>
                        <Badge variant="secondary">{appointment.department}</Badge>
                        <Badge className={getStatusColor(appointment.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(appointment.status)}
                            <span className="capitalize">{appointment.status.replace('-', ' ')}</span>
                          </div>
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Users className="h-4 w-4" />
                          <span><strong>Type:</strong> {appointment.appointmentType}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Calendar className="h-4 w-4" />
                          <span><strong>Date:</strong> {new Date(appointment.date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Clock className="h-4 w-4" />
                          <span><strong>Time:</strong> {appointment.time}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <MapPin className="h-4 w-4" />
                          <span><strong>Facility:</strong> {appointment.facility}</span>
                        </div>
                      </div>

                      <div className="text-sm text-slate-400">
                        <strong>Doctor:</strong> {appointment.doctorName}
                      </div>

                      {appointment.notes && (
                        <div className="text-sm text-slate-400 italic">
                          <strong>Notes:</strong> {appointment.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {appointment.status === 'scheduled' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleReschedule(appointment)}>Reschedule</Button>
                          <Button variant="outline" size="sm" onClick={() => handleCancel(appointment)}>Cancel</Button>
                        </>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(appointment)}>View Details</Button>
                      {appointment.status !== 'completed' && (
                        <Button size="sm" onClick={() => handleMarkCompleted(appointment)}>Mark Completed</Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredAppointments.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No appointments found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>

        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Appointment Details</DialogTitle>
              <DialogDescription>
                Review the appointment information for the selected employee.
              </DialogDescription>
            </DialogHeader>
            {selectedAppointment && (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Employee</span><span className="font-semibold">{selectedAppointment.employeeName} ({selectedAppointment.employeeId})</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Department</span><span className="font-semibold">{selectedAppointment.department}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Type</span><span className="font-semibold">{selectedAppointment.appointmentType}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Doctor</span><span className="font-semibold">{selectedAppointment.doctorName}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Facility</span><span className="font-semibold">{selectedAppointment.facility}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Date & Time</span><span className="font-semibold">{new Date(selectedAppointment.date).toLocaleDateString()} at {selectedAppointment.time}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="font-semibold capitalize">{selectedAppointment.status.replace('-', ' ')}</span></div>
                {selectedAppointment.notes && <p className="text-slate-400">Notes: <span className="font-semibold">{selectedAppointment.notes}</span></p>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporateAppointments;
