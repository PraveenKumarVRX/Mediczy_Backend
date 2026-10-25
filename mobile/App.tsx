import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Button, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { appName, connectionManager as manager, product } from './src/connection/runtime';

export default function App() {
  const [url, setUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
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
      if (mounted) setConnected(true);
    }).catch(e => { if (mounted) setError(e.message); }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to connect. Check your server address and network.'); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <StatusBar style="auto" />
      <Text style={styles.title}>{appName}</Text>
      <Text style={styles.subtitle}>{connected ? manager.connection?.discovery.displayName : 'Connect to your organisation'}</Text>
      {!connected ? <View style={styles.form}>
        <Text>Enter the server URL supplied by your organisation before signing up or logging in.</Text>
        <TextInput accessibilityLabel="Organisation server URL" style={styles.input} placeholder="https://your-organisation.example" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
        <Button title="Connect" disabled={busy || !url.trim()} onPress={() => run(async () => { await manager.connect(url); setConnected(true); })} />
      </View> : <View style={styles.form}>
        <Text selectable>{manager.connection?.origin}</Text>
        {signedIn ? <Text>Signed in successfully. Your {product} session is connected to this organisation.</Text> : <>
          {register && <>
            <TextInput accessibilityLabel="First name" style={styles.input} placeholder="First name" value={firstName} onChangeText={setFirstName} editable={!busy} />
            <TextInput accessibilityLabel="Last name" style={styles.input} placeholder="Last name" value={lastName} onChangeText={setLastName} editable={!busy} />
          </>}
          <TextInput accessibilityLabel="Email" style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!busy} />
          <TextInput accessibilityLabel="Password" style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry editable={!busy} />
          <Button title={register ? 'Sign up' : 'Log in'} disabled={busy || !email.trim() || !password || (register && (!firstName.trim() || !lastName.trim() || password.length < 8))} onPress={() => run(async () => {
            if (register) await manager.signup(email, password, firstName, lastName);
            else await manager.login(email, password);
            setPassword(''); setSignedIn(true);
          })} />
          {manager.connection?.discovery.products.some(p => p.id === product && p.registration === 'open') && <Button title={register ? 'Already registered? Log in' : 'Create an account'} disabled={busy} onPress={() => { setRegister(!register); setPassword(''); setError(''); }} />}
          <Text>Account registration is managed by your organisation. Contact its administrator for access.</Text>
        </>}
        <Button title="Change server / sign out" disabled={busy} onPress={() => run(async () => { await manager.disconnect(); setConnected(false); setSignedIn(false); setPassword(''); setEmail(''); setRegister(false); setFirstName(''); setLastName(''); })} />
      </View>}
      {busy && <ActivityIndicator accessibilityLabel="Connecting" />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' }, container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '700' }, subtitle: { fontSize: 20 }, form: { gap: 16 }, input: { borderWidth: 1, borderColor: '#64748b', borderRadius: 8, padding: 14, fontSize: 16 }, error: { color: '#b91c1c' },
});
