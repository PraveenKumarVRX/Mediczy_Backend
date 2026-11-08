import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { loadPrescriptions, loadReports } from '../api/patient';
import {
  Button, Card, Divider, EmptyState, ErrorBanner, Loading, Pill, ScreenScroll, ScreenTitle,
} from '../ui/components';
import { formatDate, useLoader } from '../ui/hooks';
import { radius, space, type, useTheme } from '../ui/theme';

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

export default function RecordsScreen() {
  const t = useTheme();
  const [tab, setTab] = useState('prescriptions');
  const records = useLoader(async () => {
    const [prescriptions, reports] = await Promise.all([loadPrescriptions(), loadReports()]);
    return { prescriptions, reports };
  });

  if (records.loading) return <ScreenScroll><Loading label="Loading your records" /></ScreenScroll>;

  return <ScreenScroll onRefresh={records.reload} refreshing={records.refreshing}>
    <ScreenTitle title="Records" subtitle="Prescriptions and reports your care team has issued" />
    {!!records.error && <ErrorBanner message={records.error} onRetry={records.reload} />}
    <Segmented
      value={tab}
      onChange={setTab}
      options={[
        { key: 'prescriptions', label: `Prescriptions (${records.data?.prescriptions.length ?? 0})` },
        { key: 'reports', label: `Reports (${records.data?.reports.length ?? 0})` },
      ]}
    />

    {tab === 'prescriptions' && (records.data?.prescriptions.length
      ? records.data.prescriptions.map(p => <Card key={p.id}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.heading, { color: t.text }]}>{p.doctorName || 'Prescription'}</Text>
            {!!p.specialty && <Text style={[type.caption, { color: t.textMuted }]}>{p.specialty}</Text>}
          </View>
          {!!p.status && <Pill label={p.status} tone={p.status === 'expired' ? 'neutral' : 'success'} />}
        </View>
        <Text style={[type.caption, { color: t.textMuted }]}>
          {formatDate(p.issuedAt)}{p.reference ? ` · ${p.reference}` : ''}
        </Text>
        {!!p.diagnosis && <Text style={[type.body, { color: t.text }]}>Diagnosis: {p.diagnosis}</Text>}
        {p.medicines.length > 0 && <>
          <Divider />
          {p.medicines.map((m, i) => <View key={`${m.name}-${i}`} style={{ gap: 2 }}>
            <Text style={[type.label, { color: t.text }]}>{m.name}</Text>
            <Text style={[type.caption, { color: t.textMuted }]}>
              {[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || 'As directed'}
            </Text>
          </View>)}
        </>}
        {!!p.advice && <Text style={[type.caption, { color: t.textMuted }]}>Advice: {p.advice}</Text>}
        {!!p.followUpDate && <Text style={[type.caption, { color: t.textMuted }]}>Follow up: {formatDate(p.followUpDate)}</Text>}
      </Card>)
      : <EmptyState
        title="No prescriptions yet"
        body="Prescriptions a doctor issues to you appear here, with the medicines, dosage and advice."
      />)}

    {tab === 'reports' && (records.data?.reports.length
      ? records.data.reports.map(r => <Card key={r.id}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.heading, { color: t.text }]}>{r.fileName || r.reportType || 'Report'}</Text>
            {!!r.reportType && <Text style={[type.caption, { color: t.textMuted }]}>{r.reportType}</Text>}
          </View>
          {!!r.status && <Pill label={r.status} tone="accent" />}
        </View>
        <Text style={[type.caption, { color: t.textMuted }]}>{formatDate(r.createdAt)}</Text>
        {!!r.description && <Text style={[type.body, { color: t.text }]}>{r.description}</Text>}
        {!!r.fileUrl && <Button
          title="Open report"
          variant="secondary"
          onPress={() => { Linking.openURL(r.fileUrl as string).catch(() => {}); }}
        />}
      </Card>)
      : <EmptyState
        title="No reports yet"
        body="Lab results and scans uploaded for you appear here, ready to open."
      />)}
  </ScreenScroll>;
}
