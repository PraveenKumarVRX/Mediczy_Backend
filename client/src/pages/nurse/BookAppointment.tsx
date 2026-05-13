import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Clock, User, Stethoscope, Phone, CheckCircle2 } from 'lucide-react';
import api from '@/utils/api';

interface Doctor {
  id: number;
  name: string;
  specialization?: string;
}

interface BookingForm {
  patientName: string;
  patientPhone: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  consultationType: 'online' | 'in-person';
  symptoms: string;
}

const INITIAL_FORM: BookingForm = {
  patientName: '',
  patientPhone: '',
  doctorId: '',
  appointmentDate: '',
  appointmentTime: '',
  consultationType: 'in-person',
  symptoms: '',
};

export default function BookAppointment() {
  const navigate = useNavigate();
  const [form, setForm] = useState<BookingForm>(INITIAL_FORM);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ appointmentId: string; date: string; time: string } | null>(null);
  const [error, setError] = useState('');

  const nurseToken = localStorage.getItem('nurseToken');

  useEffect(() => {
    if (!nurseToken) { navigate('/nurse/login'); return; }
    api.get('/nurse/chat/contacts/doctors', {
      headers: { Authorization: `Bearer ${nurseToken}` },
    }).then(({ data }) => {
      if (data.contacts) setDoctors(data.contacts);
    }).catch(() => {});
  }, [navigate, nurseToken]);

  const set = (field: keyof BookingForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.patientName || !form.patientPhone || !form.doctorId || !form.appointmentDate || !form.appointmentTime) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/nurse/book', {
        doctorId: parseInt(form.doctorId),
        patientName: form.patientName.trim(),
        patientPhone: form.patientPhone.trim(),
        appointmentDate: form.appointmentDate,
        appointmentTime: form.appointmentTime,
        consultationType: form.consultationType,
        symptoms: form.symptoms ? [form.symptoms] : [],
      }, { headers: { Authorization: `Bearer ${nurseToken}` } });

      if (data.success) {
        setSuccess({
          appointmentId: data.appointment?.id || data.appointment?.appointmentId || '—',
          date: form.appointmentDate,
          time: form.appointmentTime,
        });
        setForm(INITIAL_FORM);
      } else {
        setError(data.message || 'Booking failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to book appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto mt-12 px-4">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
            <h2 className="text-xl font-semibold">Appointment Booked</h2>
            <p className="text-muted-foreground text-sm">
              Appointment <span className="font-mono font-medium">#{success.appointmentId}</span> has been scheduled for{' '}
              <strong>{success.date}</strong> at <strong>{success.time}</strong>.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => setSuccess(null)}>Book Another</Button>
              <Button onClick={() => navigate('/nurse/appointments')}>View Appointments</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/nurse/dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Book Appointment</h1>
          <p className="text-muted-foreground text-sm">Schedule a doctor appointment for a patient</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Patient Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="patientName">Patient Name <span className="text-red-500">*</span></Label>
                <Input
                  id="patientName"
                  placeholder="Full name"
                  value={form.patientName}
                  onChange={set('patientName')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patientPhone">
                  <Phone className="inline h-3 w-3 mr-1" />Phone <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="patientPhone"
                  placeholder="10-digit mobile number"
                  value={form.patientPhone}
                  onChange={set('patientPhone')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Doctor & Schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> Doctor & Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Doctor <span className="text-red-500">*</span></Label>
              <Select value={form.doctorId} onValueChange={v => setForm(prev => ({ ...prev, doctorId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.length === 0 && (
                    <SelectItem value="_none" disabled>No doctors found</SelectItem>
                  )}
                  {doctors.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                      {d.specialization && (
                        <span className="text-muted-foreground ml-1 text-xs">· {d.specialization}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">
                  <Calendar className="inline h-3 w-3 mr-1" />Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={form.appointmentDate}
                  onChange={set('appointmentDate')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time">
                  <Clock className="inline h-3 w-3 mr-1" />Time <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="time"
                  type="time"
                  value={form.appointmentTime}
                  onChange={set('appointmentTime')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Consultation Type</Label>
              <div className="flex gap-2">
                {(['in-person', 'online'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, consultationType: type }))}
                    className="flex-1"
                  >
                    <Badge
                      variant={form.consultationType === type ? 'default' : 'outline'}
                      className="w-full justify-center py-1.5 cursor-pointer text-sm capitalize"
                    >
                      {type}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Symptoms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Symptoms / Reason for Visit</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Describe the patient's symptoms or reason for the visit (optional)"
              value={form.symptoms}
              onChange={set('symptoms')}
              rows={3}
            />
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-4 py-2">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Booking…' : 'Confirm Booking'}
        </Button>
      </form>
    </div>
  );
}
