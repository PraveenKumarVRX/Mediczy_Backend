import { Text, View } from 'react-native';
import { Appointment } from '../api/patient';
import { Card, Pill, Tone } from '../ui/components';
import { formatDateTime } from '../ui/hooks';
import { space, type, useTheme } from '../ui/theme';

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'cancelled' || s === 'no-show') return 'danger';
  if (s === 'scheduled' || s === 'rescheduled') return 'warning';
  if (s === 'confirmed' || s === 'in-progress') return 'accent';
  return 'neutral';
}

export function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const t = useTheme();
  const when = appointment.dateTime
    ? formatDateTime(appointment.dateTime)
    : [appointment.date, appointment.time].filter(Boolean).join(' · ') || '—';
  return <Card>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.heading, { color: t.text }]}>{appointment.doctorName}</Text>
        {!!appointment.specialization && <Text style={[type.caption, { color: t.textMuted }]}>{appointment.specialization}</Text>}
      </View>
      <Pill label={appointment.status} tone={statusTone(appointment.status)} />
    </View>
    <Text style={[type.body, { color: t.text }]}>{when}</Text>
    {!!appointment.consultationType && <Text style={[type.caption, { color: t.textMuted }]}>
      {appointment.consultationType === 'in-person' ? 'In person at the clinic' : `${appointment.consultationType} consultation`}
    </Text>}
    {!!appointment.reason && <Text style={[type.caption, { color: t.textMuted }]}>Reason: {appointment.reason}</Text>}
  </Card>;
}
