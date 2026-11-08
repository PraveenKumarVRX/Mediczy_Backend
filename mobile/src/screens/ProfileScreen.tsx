/**
 * Profile, sign-out and account deletion.
 *
 * Account deletion is a Play requirement for any app that can create accounts,
 * and this one can (patient signup, when the organisation enables it). The
 * server erases immediately, so the flow is deliberately two-step and typed:
 * see POST /api/users/data/erasure.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { deleteAccount, loadProfile } from '../api/patient';
import {
  Button, Card, Divider, ErrorBanner, Field, KeyValue, Loading, ScreenScroll, ScreenTitle, SectionTitle,
} from '../ui/components';
import { formatDate, useLoader, yearsSince } from '../ui/hooks';
import { space, type, useTheme } from '../ui/theme';

export default function ProfileScreen({ origin, organisation, onSignOut, onChangeServer, onDeleted }: {
  origin: string;
  organisation: string;
  onSignOut: () => void;
  onChangeServer: () => void;
  onDeleted: () => void;
}) {
  const t = useTheme();
  const profile = useLoader(loadProfile);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function erase() {
    setDeleting(true); setDeleteError('');
    try {
      await deleteAccount();
      onDeleted();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'The account could not be deleted. Contact your organisation.');
    } finally {
      setDeleting(false);
    }
  }

  if (profile.loading) return <ScreenScroll><Loading label="Loading your profile" /></ScreenScroll>;

  const age = yearsSince(profile.data?.dateOfBirth);

  return <ScreenScroll onRefresh={profile.reload} refreshing={profile.refreshing}>
    <ScreenTitle title="Profile" subtitle={profile.data?.email} />
    {!!profile.error && <ErrorBanner message={profile.error} onRetry={profile.reload} />}

    {profile.data && <Card>
      <Text style={[type.title, { color: t.text }]}>{profile.data.name}</Text>
      <Divider />
      <KeyValue label="Phone" value={profile.data.phone} />
      <KeyValue label="Date of birth" value={profile.data.dateOfBirth ? `${formatDate(profile.data.dateOfBirth)}${age != null ? ` (${age})` : ''}` : null} />
      <KeyValue label="Gender" value={profile.data.gender} />
      <KeyValue label="Blood group" value={profile.data.bloodType} />
      <KeyValue label="Allergies" value={profile.data.allergies.length ? profile.data.allergies.join(', ') : 'None recorded'} />
    </Card>}

    <SectionTitle>Your organisation</SectionTitle>
    <Card>
      <KeyValue label="Organisation" value={profile.data?.clinicName || organisation} />
      <KeyValue label="Phone" value={profile.data?.clinicPhone} />
      <KeyValue label="Email" value={profile.data?.clinicEmail} />
      <Divider />
      <Text style={[type.caption, { color: t.textMuted }]}>Server</Text>
      <Text selectable style={[type.caption, { color: t.text }]}>{origin}</Text>
    </Card>

    <SectionTitle>Account</SectionTitle>
    <Button title="Sign out" variant="secondary" onPress={onSignOut} />
    <Button title="Change organisation server" variant="secondary" onPress={onChangeServer} />

    <SectionTitle>Delete account</SectionTitle>
    <Card>
      <Text style={[type.body, { color: t.text }]}>
        Deleting your account erases your profile and the health data held against it at this
        organisation. It happens immediately and cannot be undone.
      </Text>
      <Text style={[type.caption, { color: t.textMuted }]}>
        Records your clinician is required by law to retain may be kept in the organisation's
        medical record after your account is closed.
      </Text>
      {!confirming
        ? <Button title="Delete my account" variant="danger" onPress={() => { setConfirming(true); setDeleteError(''); }} />
        : <View style={{ gap: space.md }}>
          <Field
            label="Type DELETE to confirm"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
          />
          {!!deleteError && <ErrorBanner message={deleteError} />}
          <Button
            title="Permanently delete my account"
            variant="danger"
            disabled={typed.trim().toUpperCase() !== 'DELETE'}
            loading={deleting}
            onPress={erase}
          />
          <Button title="Keep my account" variant="secondary" onPress={() => { setConfirming(false); setTyped(''); setDeleteError(''); }} />
        </View>}
    </Card>
  </ScreenScroll>;
}
