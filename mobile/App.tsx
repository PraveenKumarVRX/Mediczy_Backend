/**
 * App shell: connect to an organisation, sign in, then hand over to the
 * product's own app.
 *
 * The connect-then-sign-in order is the platform's model, not a detail: one
 * binary serves many organisations, so the server address is chosen first and
 * every request afterwards is bound to that connection (see
 * src/connection/core.ts).
 */
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import PatientApp from './src/PatientApp';
import { appName, connectionManager as manager, product } from './src/connection/runtime';
import { Button, Field } from './src/ui/components';
import { space, type, useTheme } from './src/ui/theme';

/** Cheap authenticated call used to tell a live session from an expired one. */
const SESSION_PROBE: Partial<Record<typeof product, string>> = {
  patient: '/api/patient/profile',
};

function Shell() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    let mounted = true;
    manager.restore().then(async saved => {
      if (!saved || !mounted) return;
      setUrl(saved.origin);
      await manager.connect(saved.origin, saved.discovery.deploymentId);
      if (!mounted) return;
      setConnected(true);
      // The address was remembered; the session may still be valid too.
      const resumed = await manager.resumeSession(SESSION_PROBE[product]);
      if (mounted && resumed) setSignedIn(true);
    }).catch(e => { if (mounted) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect. Check your server address and network.');
    } finally { setBusy(false); }
  }

  function resetAuthForm() {
    setPassword(''); setEmail(''); setRegister(false); setFirstName(''); setLastName('');
  }

  async function changeServer(message = '') {
    await manager.disconnect();
    setConnected(false); setSignedIn(false); resetAuthForm(); setNotice(message);
  }

  // Signed in: the product's own app owns the screen from here.
  if (connected && signedIn && product === 'patient') {
    return <PatientApp
      origin={manager.connection?.origin ?? ''}
      organisation={manager.connection?.discovery.displayName ?? appName}
      onSignOut={() => run(async () => {
        await manager.signOut();
        setSignedIn(false); resetAuthForm();
        setNotice('You have been signed out.');
      })}
      onChangeServer={() => run(() => changeServer())}
    />;
  }

  const canRegister = product === 'patient'
    && manager.connection?.discovery.products.some(p => p.id === product && p.registration === 'open');

  return <KeyboardAvoidingView
    style={{ flex: 1, backgroundColor: t.bg }}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  >
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar style="auto" />
      <View style={{ gap: space.xs }}>
        <Text style={[type.display, { color: t.text }]}>{appName}</Text>
        <Text style={[type.body, { color: t.textMuted }]}>
          {connected ? manager.connection?.discovery.displayName : 'Connect to your organisation'}
        </Text>
      </View>

      {!!notice && <Text style={[type.body, { color: t.textMuted }]}>{notice}</Text>}

      {!connected ? <View style={{ gap: space.lg }}>
        <Text style={[type.body, { color: t.textMuted }]}>
          Enter the server address your organisation gave you. It decides which organisation this
          app signs you in to.
        </Text>
        <Field
          label="Organisation server URL"
          placeholder="https://your-organisation.example"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
        />
        <Button
          title="Connect"
          disabled={busy || !url.trim()}
          onPress={() => run(async () => { setNotice(''); await manager.connect(url); setConnected(true); })}
        />
      </View> : <View style={{ gap: space.lg }}>
        <Text selectable style={[type.caption, { color: t.textMuted }]}>{manager.connection?.origin}</Text>
        {signedIn
          ? <Text style={[type.body, { color: t.text }]}>
            Signed in. Your {product} session is connected to this organisation.
          </Text>
          : <>
            {register && <>
              <Field label="First name" value={firstName} onChangeText={setFirstName} editable={!busy} />
              <Field label="Last name" value={lastName} onChangeText={setLastName} editable={!busy} />
            </>}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry editable={!busy} />
            <Button
              title={register ? 'Sign up' : 'Log in'}
              loading={busy}
              disabled={busy || !email.trim() || !password || (register && (!firstName.trim() || !lastName.trim() || password.length < 8))}
              onPress={() => run(async () => {
                setNotice('');
                if (register) await manager.signup(email, password, firstName, lastName);
                else await manager.login(email, password);
                setPassword(''); setSignedIn(true);
              })}
            />
            {canRegister && <Button
              title={register ? 'Already registered? Log in' : 'Create an account'}
              variant="secondary"
              disabled={busy}
              onPress={() => { setRegister(!register); setPassword(''); setError(''); }}
            />}
            {!canRegister && <Text style={[type.caption, { color: t.textMuted }]}>
              Account registration is managed by your organisation. Contact its administrator for access.
            </Text>}
          </>}
        <Button title="Change server" variant="secondary" disabled={busy} onPress={() => run(() => changeServer())} />
      </View>}

      {busy && <ActivityIndicator accessibilityLabel="Working" color={t.accent} />}
      {!!error && <Text accessibilityRole="alert" style={[type.body, { color: t.danger }]}>{error}</Text>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

export default function App() {
  return <SafeAreaProvider><Shell /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.xl,
    gap: space.xl, maxWidth: 520, width: '100%', alignSelf: 'center',
  },
});
