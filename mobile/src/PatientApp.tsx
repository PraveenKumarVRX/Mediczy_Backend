/**
 * The signed-in patient app: five tabs plus a booking screen.
 *
 * The tab bar is hand-rolled rather than @react-navigation/bottom-tabs on
 * purpose — five destinations and one modal need no navigator, and this keeps
 * the whole shell in one file with no provider wiring to get wrong. Android's
 * hardware back button is handled explicitly below, which is the one thing a
 * navigator would otherwise give us.
 */
import { useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppointmentsScreen from './screens/AppointmentsScreen';
import BookAppointmentScreen from './screens/BookAppointmentScreen';
import HealthScreen from './screens/HealthScreen';
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import RecordsScreen from './screens/RecordsScreen';
import { space, type, useTheme } from './ui/theme';

type TabKey = 'home' | 'appointments' | 'records' | 'health' | 'profile';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'appointments', label: 'Visits', icon: 'calendar-outline' },
  { key: 'records', label: 'Records', icon: 'document-text-outline' },
  { key: 'health', label: 'Health', icon: 'pulse-outline' },
  { key: 'profile', label: 'Profile', icon: 'person-outline' },
];

export default function PatientApp({ origin, organisation, onSignOut, onChangeServer }: {
  origin: string; organisation: string; onSignOut: () => void; onChangeServer: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('home');
  const [booking, setBooking] = useState(false);
  const [flash, setFlash] = useState('');
  // Remounts the data screens after a booking so the new appointment is there.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (booking) { setBooking(false); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [booking, tab]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(''), 6000);
    return () => clearTimeout(timer);
  }, [flash]);

  function openBooking() { setFlash(''); setBooking(true); }

  function afterBooking(message: string) {
    setBooking(false);
    setVersion(v => v + 1);
    setTab('appointments');
    setFlash(message);
  }

  return <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
    {!!flash && <View style={{ backgroundColor: t.successSoft, paddingHorizontal: space.lg, paddingVertical: space.md }}>
      <Text accessibilityRole="alert" style={[type.label, { color: t.success }]}>{flash}</Text>
    </View>}

    <View style={{ flex: 1 }} key={version}>
      {booking
        ? <BookAppointmentScreen onBooked={afterBooking} onCancel={() => setBooking(false)} />
        : tab === 'home' ? <HomeScreen onBook={openBooking} onSeeAppointments={() => setTab('appointments')} />
          : tab === 'appointments' ? <AppointmentsScreen onBook={openBooking} />
            : tab === 'records' ? <RecordsScreen />
              : tab === 'health' ? <HealthScreen />
                : <ProfileScreen
                  origin={origin}
                  organisation={organisation}
                  onSignOut={onSignOut}
                  onChangeServer={onChangeServer}
                  onDeleted={onChangeServer}
                />}
    </View>

    <View style={{
      flexDirection: 'row', backgroundColor: t.surface,
      borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth,
      paddingBottom: Math.max(insets.bottom, space.sm), paddingTop: space.sm,
    }}>
      {TABS.map(item => {
        const active = !booking && item.key === tab;
        return <Pressable
          key={item.key}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: active }}
          onPress={() => { setBooking(false); setTab(item.key); }}
          style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.xs, minHeight: 48, justifyContent: 'center' }}
        >
          <Ionicons name={item.icon} size={22} color={active ? t.accent : t.textMuted} />
          <Text style={[type.caption, { color: active ? t.accent : t.textMuted, fontWeight: active ? '700' : '400' }]}>
            {item.label}
          </Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
