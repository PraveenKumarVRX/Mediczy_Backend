/**
 * Book a consultation: pick a doctor, a day, then a slot the server says is
 * actually free, and submit. Slots come from
 * GET /api/doctors/available-slots/:id?date= — the same source the clinic's own
 * web booking uses, so a slot shown here is one the server will accept.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { bookAppointment, Doctor, loadDoctors, loadSlots, SlotsForDay } from '../api/patient';
import {
  Button, Card, Divider, EmptyState, ErrorBanner, Field, Loading, Pill, ScreenScroll, ScreenTitle, SectionTitle,
} from '../ui/components';
import { formatDayShort, isoDate, useLoader } from '../ui/hooks';
import { radius, space, type, useTheme } from '../ui/theme';

type Mode = 'video' | 'in-person';

function DoctorCard({ doctor, selected, onPress }: { doctor: Doctor; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Card
    onPress={onPress}
    accessibilityLabel={`Select ${doctor.name}`}
    style={selected ? { borderColor: t.accent, borderWidth: 2, backgroundColor: t.accentSoft } : undefined}
  >
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.heading, { color: t.text }]}>{doctor.name}</Text>
        {!!doctor.specialization && <Text style={[type.caption, { color: t.textMuted }]}>{doctor.specialization}</Text>}
        {!!doctor.qualification && <Text style={[type.caption, { color: t.textMuted }]}>{doctor.qualification}</Text>}
      </View>
      {selected && <Pill label="Selected" tone="accent" />}
    </View>
    <View style={{ flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' }}>
      {doctor.experience != null && <Text style={[type.caption, { color: t.textMuted }]}>{doctor.experience} yrs experience</Text>}
      {doctor.fee != null && <Text style={[type.caption, { color: t.textMuted }]}>Fee ₹{doctor.fee}</Text>}
      {doctor.rating != null && doctor.rating > 0 && <Text style={[type.caption, { color: t.textMuted }]}>★ {doctor.rating}</Text>}
    </View>
  </Card>;
}

function Chip({ label, selected, onPress, disabled }: {
  label: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  const t = useTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected, disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={{
      paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.pill,
      borderWidth: 1, minHeight: 44, justifyContent: 'center',
      borderColor: selected ? t.accent : t.border,
      backgroundColor: selected ? t.accent : t.surface,
      opacity: disabled ? 0.4 : 1,
    }}
  >
    <Text style={[type.label, { color: selected ? t.accentText : t.text }]}>{label}</Text>
  </Pressable>;
}

export default function BookAppointmentScreen({ onBooked, onCancel }: {
  onBooked: (message: string) => void; onCancel: () => void;
}) {
  const t = useTheme();
  const doctors = useLoader(loadDoctors);
  const [search, setSearch] = useState('');
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [dayOffset, setDayOffset] = useState(1);
  const [mode, setMode] = useState<Mode>('video');
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const date = isoDate(dayOffset);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => i + 1), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = doctors.data ?? [];
    if (!q) return all.slice(0, 25);
    return all.filter(d =>
      d.name.toLowerCase().includes(q) || (d.specialization ?? '').toLowerCase().includes(q),
    ).slice(0, 25);
  }, [doctors.data, search]);

  const loadSlotsForSelection = useCallback(async (): Promise<SlotsForDay | null> => {
    if (!doctorId) return null;
    return loadSlots(doctorId, date);
  }, [doctorId, date]);
  const slots = useLoader(loadSlotsForSelection, `${doctorId ?? ''}:${date}`);

  const available = mode === 'video' ? slots.data?.online ?? [] : slots.data?.inPerson ?? [];

  async function submit() {
    if (!doctorId || !slot) return;
    setSubmitting(true); setSubmitError('');
    try {
      await bookAppointment({ doctorId, date, time: slot, consultationType: mode, reason });
      const doctor = (doctors.data ?? []).find(d => d.id === doctorId);
      onBooked(`Appointment requested with ${doctor?.name ?? 'your doctor'} on ${formatDayShort(date)} at ${slot}.`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'The appointment could not be booked. Try another slot.');
    } finally {
      setSubmitting(false);
    }
  }

  if (doctors.loading) return <ScreenScroll><Loading label="Loading doctors" /></ScreenScroll>;

  return <ScreenScroll>
    <ScreenTitle title="Book an appointment" subtitle="Choose a doctor, a day and a free slot" />
    {!!doctors.error && <ErrorBanner message={doctors.error} onRetry={doctors.reload} />}

    <SectionTitle>1. Doctor</SectionTitle>
    <Field
      label="Search by name or specialty"
      value={search}
      onChangeText={setSearch}
      placeholder="Cardiologist, Dr Nita…"
      autoCapitalize="none"
      autoCorrect={false}
    />
    {filtered.length
      ? filtered.map(d => <DoctorCard
        key={d.id}
        doctor={d}
        selected={d.id === doctorId}
        onPress={() => { setDoctorId(d.id); setSlot(''); }}
      />)
      : <EmptyState title="No doctors match" body="Clear the search to see everyone available at this organisation." />}

    {doctorId != null && <>
      <Divider />
      <SectionTitle>2. Day</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {days.map(offset => <Chip
          key={offset}
          label={formatDayShort(isoDate(offset))}
          selected={offset === dayOffset}
          onPress={() => { setDayOffset(offset); setSlot(''); }}
        />)}
      </View>

      <SectionTitle>3. Consultation type</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="Video" selected={mode === 'video'} onPress={() => { setMode('video'); setSlot(''); }} />
        <Chip label="In person" selected={mode === 'in-person'} onPress={() => { setMode('in-person'); setSlot(''); }} />
      </View>

      <SectionTitle>4. Slot</SectionTitle>
      {slots.loading
        ? <Loading label="Checking availability" />
        : slots.error
          ? <ErrorBanner message={slots.error} onRetry={slots.reload} />
          : slots.data?.isOffDay
            ? <EmptyState title="Not consulting that day" body="Pick another day to see this doctor's free slots." />
            : available.length
              ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {available.map(s => <Chip key={s} label={s} selected={s === slot} onPress={() => setSlot(s)} />)}
              </View>
              : <EmptyState
                title="No free slots"
                body={`This doctor has no ${mode === 'video' ? 'video' : 'in-person'} slots left on ${formatDayShort(date)}. Try another day or type.`}
              />}

      <SectionTitle>5. Reason (optional)</SectionTitle>
      <TextInput
        accessibilityLabel="Reason for the visit"
        multiline
        numberOfLines={3}
        value={reason}
        onChangeText={setReason}
        placeholder="What would you like to discuss?"
        placeholderTextColor={t.textMuted}
        style={{
          borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, color: t.text,
          borderRadius: radius.md, padding: space.md, fontSize: 16, minHeight: 90, textAlignVertical: 'top',
        }}
      />

      {!!submitError && <ErrorBanner message={submitError} />}
      <Button
        title={slot ? `Confirm ${formatDayShort(date)} at ${slot}` : 'Pick a slot to continue'}
        disabled={!slot}
        loading={submitting}
        onPress={submit}
      />
    </>}
    <Button title="Cancel" variant="secondary" onPress={onCancel} />
  </ScreenScroll>;
}
