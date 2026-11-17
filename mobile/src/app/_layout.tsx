import '@/lib/web-alert';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/hooks/use-session';

function Gate() {
  const { session, wrongRole, onboarding, loading, org } = useSession();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={org.brandColor} />
      </View>
    );
  }

  const signedIn = !!session;
  const ok = signedIn && !wrongRole;
  const needsTerms = ok && !!onboarding?.needs_terms;
  const ready = ok && !needsTerms;

  return (
    <Stack screenOptions={{ headerTintColor: org.brandColor, headerShadowVisible: false, headerStyle: { backgroundColor: '#eef3fa' }, headerTitleStyle: { fontWeight: '800', color: '#0b1220' }, contentStyle: { backgroundColor: '#f4f7fb' } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && wrongRole}>
        <Stack.Screen name="wrong-role" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={needsTerms}>
        <Stack.Screen name="terms" options={{ title: 'Terms and conditions', headerBackVisible: false }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="shift/[id]" options={{ title: 'Shift' }} />
        <Stack.Screen name="incident/new" options={{ title: 'Report an incident', presentation: 'modal' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="onboarding" options={{ title: 'Onboarding' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
