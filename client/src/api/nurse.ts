import api from '@/utils/api';

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('nurseToken') || ''}`,
});

export const bookAppointmentForPatient = (payload: {
  doctorId: number;
  patientName: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  consultationType?: 'in-person' | 'online';
  symptoms?: string[];
}) => api.post('/nurse/book', payload, { headers: authHeader() });

export const getVideoConsultationToken = (roomName: string) =>
  api.get('/nurse/chat/call-token', { params: { roomName }, headers: authHeader() });

export const getDoctorContacts = () =>
  api.get('/nurse/chat/contacts/doctors', { headers: authHeader() });
