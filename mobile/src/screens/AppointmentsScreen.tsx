import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { loadAppointments } from '../api/patient';
import { Button, EmptyState, ErrorBanner, Loading, ScreenScroll, ScreenTitle } from '../ui/components';
import { useLoader } from '../ui/hooks';
import { radius, space, type, useTheme } from '../ui/theme';
import { AppointmentRow } from './appointment-parts';

function Segmented({ options, value, onChange }: {
  options: { key: string; label: string }[]; value: string; onChange: (key: string) => void;
}) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: space.xs }}>
    {options.map(o => {
      const active = o.key === value;
      return <Pressable
        key={o.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(o.key)}
        style={{
          flex: 1, paddingVertical: space.md, borderRadius: radius.sm, alignItems: 'center',
          backgroundColor: active ? t.surface : 'transparent',
        }}
      >
        <Text style={[type.label, { color: active ? t.text : t.textMuted }]}>{o.label}</Text>
      </Pressable>;
    })}
  </View>;
}

export default function AppointmentsScreen({ onBook }: { onBook: () => void }) {
  const [tab, setTab] = useState('upcoming');
  const appointments = useLoader(loadAppointments);

  if (appointments.loading) return <ScreenScroll><Loading label="Loading appointments" /></ScreenScroll>;

  const shown = tab === 'upcoming' ? appointments.data?.upcoming ?? [] : appointments.data?.past ?? [];

  return <ScreenScroll onRefresh={appointments.reload} refreshing={appointments.refreshing}>
    <ScreenTitle title="Appointments" subtitle="Your consultations at this organisation" />
    <Button title="Book an appointment" onPress={onBook} />
    {!!appointments.error && <ErrorBanner message={appointments.error} onRetry={appointments.reload} />}
    <Segmented
      value={tab}
      onChange={setTab}
      options={[
        { key: 'upcoming', label: `Upcoming (${appointments.data?.upcoming.length ?? 0})` },
        { key: 'past', label: `Past (${appointments.data?.past.length ?? 0})` },
      ]}
    />
    {shown.length
      ? shown.map(a => <AppointmentRow key={`${a.id}-${a.reference ?? ''}`} appointment={a} />)
      : <EmptyState
        title={tab === 'upcoming' ? 'Nothing scheduled' : 'No past appointments'}
        body={tab === 'upcoming'
          ? 'Book a consultation and it will show up here with its date, time and doctor.'
          : 'Completed and cancelled consultations are kept here for your records.'}
      />}
  </ScreenScroll>;
}
