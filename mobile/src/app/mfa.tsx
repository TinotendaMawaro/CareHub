import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Card, H1, Input, Label, Muted, Screen } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';

/** Second step of sign-in for accounts that have two-factor authentication switched on. */
export default function MfaChallenge() {
  const { signOut, recheckMfa, session } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp.find((f) => f.status === 'verified');
    const { error: err } = factor
      ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
      : { error: new Error('No authenticator found on your account.') };
    setBusy(false);
    if (err) return setError("That code didn't match. Codes change every 30 seconds - try the current one.");
    await recheckMfa();
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <H1>Two-factor authentication</H1>
            <Muted>Open your authenticator app and enter the 6-digit code for {session?.user.email}.</Muted>
            <View>
              <Label>Authenticator code</Label>
              <Input
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                maxLength={6}
                style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }}
                onSubmitEditing={() => code.length === 6 && void verify()}
                accessibilityLabel="Authenticator code"
              />
            </View>
            {error && <Banner text={error} />}
            <Button title="Verify" onPress={verify} loading={busy} disabled={code.length !== 6} />
            <Button title="Sign out" kind="outline" onPress={signOut} />
            <Muted>Lost your phone? Ask the office to reset two-factor authentication on your account.</Muted>
          </Card>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
