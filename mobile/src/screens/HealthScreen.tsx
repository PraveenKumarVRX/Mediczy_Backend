import { Text, View } from 'react-native';
import { loadCheckupBookings, loadCheckupPackages, loadVitals, Vital } from '../api/patient';
import {
  Card, EmptyState, ErrorBanner, KeyValue, Loading, Pill, ScreenScroll, ScreenTitle, SectionTitle,
} from '../ui/components';
import { formatDateTime, useLoader } from '../ui/hooks';
import { space, type, useTheme } from '../ui/theme';

function reading(v: Vital) {
  const parts: string[] = [];
  if (v.systolic != null && v.diastolic != null) parts.push(`BP ${v.systolic}/${v.diastolic}`);
  if (v.heartRate != null) parts.push(`${v.heartRate} bpm`);
  if (v.spo2 != null) parts.push(`SpO₂ ${v.spo2}%`);
  if (v.temperature != null) parts.push(`${v.temperature}°`);
  if (v.weight != null) parts.push(`${v.weight} kg`);
  if (v.bloodSugar != null) parts.push(`Glucose ${v.bloodSugar}`);
  return parts;
}

export default function HealthScreen() {
  const t = useTheme();
  const health = useLoader(async () => {
    const [vitals, packages, bookings] = await Promise.all([
      loadVitals(), loadCheckupPackages(), loadCheckupBookings(),
    ]);
    return { vitals, packages, bookings };
  });

  if (health.loading) return <ScreenScroll><Loading label="Loading your health record" /></ScreenScroll>;

  const latest = health.data?.vitals[0];

  return <ScreenScroll onRefresh={health.reload} refreshing={health.refreshing}>
    <ScreenTitle title="Health" subtitle="Vitals and health checkups" />
    {!!health.error && <ErrorBanner message={health.error} onRetry={health.reload} />}

    <SectionTitle>Latest vitals</SectionTitle>
    {latest
      ? <Card>
        <Text style={[type.caption, { color: t.textMuted }]}>Recorded {formatDateTime(latest.recordedAt)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {reading(latest).map(r => <Pill key={r} label={r} tone="accent" />)}
        </View>
        {reading(latest).length === 0 && <Text style={[type.body, { color: t.textMuted }]}>
          This entry has no readings on it.
        </Text>}
      </Card>
      : <EmptyState
        title="No vitals recorded"
        body="Readings taken at the clinic, or synced from a device, show up here with the date they were taken."
      />}

    {(health.data?.vitals.length ?? 0) > 1 && <>
      <SectionTitle>History</SectionTitle>
      {health.data!.vitals.slice(1, 8).map((v, i) => <Card key={`${v.recordedAt ?? ''}-${i}`}>
        <Text style={[type.label, { color: t.text }]}>{formatDateTime(v.recordedAt)}</Text>
        <Text style={[type.body, { color: t.textMuted }]}>{reading(v).join(' · ') || 'No readings'}</Text>
      </Card>)}
    </>}

    <SectionTitle>My health checkups</SectionTitle>
    {health.data?.bookings.length
      ? health.data.bookings.map(b => <Card key={b.id}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <Text style={[type.heading, { color: t.text, flex: 1 }]}>{b.packageName || 'Health checkup'}</Text>
          {!!b.status && <Pill label={b.status} tone="accent" />}
        </View>
        <KeyValue label="Scheduled" value={b.scheduledFor ? formatDateTime(b.scheduledFor) : null} />
        <KeyValue label="Location" value={b.location} />
      </Card>)
      : <EmptyState
        title="No checkups booked"
        body="Checkups your organisation arranges for you appear here, with the date and the lab."
      />}

    <SectionTitle>Available packages</SectionTitle>
    {health.data?.packages.length
      ? health.data.packages.map(p => <Card key={p.id}>
        <Text style={[type.heading, { color: t.text }]}>{p.name}</Text>
        {!!p.description && <Text style={[type.body, { color: t.textMuted }]}>{p.description}</Text>}
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          {p.testCount != null && <Text style={[type.caption, { color: t.textMuted }]}>{p.testCount} tests</Text>}
          {p.price != null && <Text style={[type.caption, { color: t.textMuted }]}>₹{p.price}</Text>}
        </View>
      </Card>)
      : <EmptyState
        title="No packages offered"
        body="When your organisation publishes a checkup package you are entitled to, it is listed here."
      />}
  </ScreenScroll>;
}
