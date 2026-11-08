import { Text, View } from 'react-native';
import { loadAppointments, loadNotifications, loadProfile, loadPrescriptions } from '../api/patient';
import { Button, Card, EmptyState, ErrorBanner, Loading, ScreenScroll, ScreenTitle, SectionTitle } from '../ui/components';
import { formatDateTime, useLoader } from '../ui/hooks';
import { space, type, useTheme } from '../ui/theme';
import { AppointmentRow } from './appointment-parts';

export default function HomeScreen({ onBook, onSeeAppointments }: {
  onBook: () => void; onSeeAppointments: () => void;
}) {
  const t = useTheme();
  const summary = useLoader(async () => {
    const [profile, appointments, prescriptions, notifications] = await Promise.all([
      loadProfile(), loadAppointments(), loadPrescriptions(), loadNotifications(),
    ]);
    return { profile, appointments, prescriptions, notifications };
  });

  if (summary.loading) return <ScreenScroll><Loading label="Loading your health summary" /></ScreenScroll>;

  return <ScreenScroll onRefresh={summary.reload} refreshing={summary.refreshing}>
    <ScreenTitle
      title={summary.data ? summary.data.profile.name : 'Welcome'}
      subtitle={summary.data?.profile.clinicName ? `Care at ${summary.data.profile.clinicName}` : undefined}
    />

    {!!summary.error && <ErrorBanner message={summary.error} onRetry={summary.reload} />}

    {summary.data && <>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[type.display, { color: t.accent }]}>{summary.data.appointments.upcoming.length}</Text>
          <Text style={[type.caption, { color: t.textMuted, textAlign: 'center' }]}>Upcoming visits</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[type.display, { color: t.accent }]}>{summary.data.prescriptions.length}</Text>
          <Text style={[type.caption, { color: t.textMuted, textAlign: 'center' }]}>Prescriptions</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[type.display, { color: t.accent }]}>
            {summary.data.notifications.filter(n => !n.read).length}
          </Text>
          <Text style={[type.caption, { color: t.textMuted, textAlign: 'center' }]}>Unread alerts</Text>
        </Card>
      </View>

      <SectionTitle>Next appointment</SectionTitle>
      {summary.data.appointments.upcoming.length
        ? <>
          <AppointmentRow appointment={summary.data.appointments.upcoming[0]} />
          {summary.data.appointments.upcoming.length > 1 &&
            <Button title={`See all ${summary.data.appointments.upcoming.length} upcoming`} variant="secondary" onPress={onSeeAppointments} />}
        </>
        : <EmptyState
          title="No upcoming appointments"
          body="Book a consultation with a doctor at your organisation and it will appear here."
        />}
      <Button title="Book an appointment" onPress={onBook} />

      {summary.data.notifications.length > 0 && <>
        <SectionTitle>Recent notifications</SectionTitle>
        {summary.data.notifications.slice(0, 3).map(n => <Card key={n.id}>
          <Text style={[type.label, { color: t.text }]}>{n.title || 'Notification'}</Text>
          {!!n.body && <Text style={[type.body, { color: t.textMuted }]}>{n.body}</Text>}
          <Text style={[type.caption, { color: t.textMuted }]}>{formatDateTime(n.createdAt)}</Text>
        </Card>)}
      </>}
    </>}
  </ScreenScroll>;
}
