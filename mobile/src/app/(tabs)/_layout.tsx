import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/hooks/use-session';

const icon = (glyph: string) => ({ color, focused }: { color: unknown; focused: boolean }) => (
  <Text style={{ fontSize: focused ? 22 : 20, color: color as string, opacity: focused ? 1 : 0.75 }}>{glyph}</Text>
);

export default function TabsLayout() {
  const { org } = useSession();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: org.brandColor,
        tabBarInactiveTintColor: '#64748b',
        headerTintColor: org.brandColor,
        headerBackground: () => <LinearGradient colors={[`${org.brandColor}2e`, '#f4f7fb']} style={StyleSheet.absoluteFill} />,
        headerTitleStyle: { fontWeight: '800', color: '#0b1220' },
        headerShadowVisible: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          position: 'absolute', left: 16, right: 16, bottom: 18, height: 66, borderRadius: 28, borderTopWidth: 0,
          backgroundColor: 'transparent', elevation: 8, overflow: 'hidden', paddingTop: 6,
          shadowColor: '#0b1220', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.6)' }]} />
          </View>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'My shifts', tabBarIcon: icon('\u{1F4C5}') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('\u{1F4AC}') }} />
      <Tabs.Screen name="timesheets" options={{ title: 'Timesheets', tabBarIcon: icon('\u{1F551}') }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: icon('\u{1F464}') }} />
    </Tabs>
  );
}
