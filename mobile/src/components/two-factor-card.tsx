import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Banner, Button, Card, Input, Label, Muted, Pill, colors } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Setup = { factorId: string; secret: string; uri: string };

/** Profile card: turn two-factor authentication on or off for the signed-in worker. */
export function TwoFactorCard() {
  const [status, setStatus] = useState<'loading' | 'on' | 'off'>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp.find((f) => f.status === 'verified');
    setFactorId(verified?.id ?? null);
    setStatus(verified ? 'on' : 'off');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    setBusy(true);
    setError(null);
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
    setBusy(false);
    if (err || !data) return setError(err?.message ?? 'Could not start setup.');
    setSetup({ factorId: data.id, secret: data.totp.secret, uri: data.totp.uri });
  }

  async function openAuthenticator() {
    if (!setup) return;
    try {
      await Linking.openURL(setup.uri);
    } catch {
      Alert.alert('No authenticator app found', 'Install Google Authenticator or Microsoft Authenticator, or type the setup key into your app.');
    }
  }

  async function verify() {
    if (!setup) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.factorId, code: code.trim() });
    setBusy(false);
    if (err) return setError("That code didn't match. Codes change every 30 seconds - try the current one.");
    setSetup(null);
    setCode('');
    Alert.alert('Two-factor authentication is on', "You'll be asked for a code from your authenticator app each time you sign in.");
    await load();
  }

  function turnOff() {
    if (!factorId) return;
    Alert.alert('Turn off two-factor authentication?', 'Your account will be protected by your password only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn off', style: 'destructive', onPress: async () => {
          const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
          if (err) return Alert.alert('Could not turn it off', err.message);
          await load();
        },
      },
    ]);
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label>Two-factor authentication</Label>
        {status !== 'loading' && <Pill text={status === 'on' ? 'On' : 'Off'} tone={status === 'on' ? 'ok' : 'muted'} />}
      </View>

      {status === 'on' && (
        <>
          <Muted>You enter a code from your authenticator app each time you sign in.</Muted>
          <Button title="Turn off" kind="outline" onPress={turnOff} />
        </>
      )}

      {status === 'off' && !setup && (
        <>
          <Muted>Add a second check at sign-in so a stolen password alone can't open your account.</Muted>
          <Button title="Set up" kind="outline" onPress={start} loading={busy} />
        </>
      )}

      {setup && (
        <>
          <Muted>1. Add CareHub to your authenticator app (Google Authenticator, Microsoft Authenticator or similar).</Muted>
          <Button title="Add to authenticator app" onPress={openAuthenticator} />
          <Muted>Or type this setup key into the app:</Muted>
          <Text selectable style={{ fontFamily: 'Courier', fontSize: 13, color: colors.text }}>{setup.secret}</Text>
          <Muted>2. Enter the 6-digit code the app shows.</Muted>
          <Input
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            style={{ fontSize: 20, letterSpacing: 6, textAlign: 'center' }}
            accessibilityLabel="Authenticator code"
          />
          <Button title="Turn on" onPress={verify} loading={busy} disabled={code.length !== 6} />
          <Button title="Cancel" kind="outline" onPress={() => { setSetup(null); setCode(''); }} />
        </>
      )}

      {error && <Banner text={error} />}
    </Card>
  );
}
