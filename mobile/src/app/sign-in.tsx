import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Glass, Input, Label, Muted, Screen, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const { org } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'That email and password do not match.' : err.message);
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {org.logoUrl ? (
                <Image source={{ uri: org.logoUrl }} style={{ width: 96, height: 96 }} resizeMode="contain" accessibilityLabel={`${org.name} logo`} />
              ) : (
                <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: org.brandColor, alignItems: 'center', justifyContent: 'center', shadowColor: org.brandColor, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
                  <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{org.name.slice(0, 1)}</Text>
                </View>
              )}
              <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: colors.text }}>{org.name}</Text>
              <Muted>Sign in to see your shifts</Muted>
            </View>
            <Glass innerStyle={{ padding: 18, gap: 14 }} radius={24}>
            <View>
              <Label>Email</Label>
              <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
            </View>
            <View>
              <Label>Password</Label>
              <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
            </View>
            {error && <Banner text={error} />}
            <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
            </Glass>
            <Muted style={{ textAlign: 'center' }}>Forgot your password? Ask the office to reset it.</Muted>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}
