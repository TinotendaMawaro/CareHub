import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, H1, Muted, Screen } from '@/components/ui';
import { useSession } from '@/hooks/use-session';

export default function WrongRole() {
  const { signOut, org } = useSession();
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ gap: 12 }}>
          <H1>This app is for staff</H1>
          <Muted>
            Your account is not set up as staff for {org.name}. Office staff use the web dashboard. If you should have a staff account, ask the office.
          </Muted>
          <Button title="Sign out" kind="outline" onPress={signOut} />
        </View>
      </SafeAreaView>
    </Screen>
  );
}
