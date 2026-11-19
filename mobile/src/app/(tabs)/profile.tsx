import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, Text, View } from 'react-native';
import { ProfilePhoto } from '@/components/profile-photo';
import { TwoFactorCard } from '@/components/two-factor-card';
import { Banner, Button, Card, Input, Label, Muted, Screen, TAB_BAR_SPACE, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { needsRenewal } from '@/lib/documents';
import { formatDay, localDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Note = { id: string; title: string; message: string; read: boolean; timestamp: string };
type Leave = { id: string; start_date: string; end_date: string; status: string; reason: string | null };

export default function Profile() {
  const router = useRouter();
  const { me, org, session, onboarding, refreshOnboarding, signOut } = useSession();
  const [notes, setNotes] = useState<Note[]>([]);
  const [leave, setLeave] = useState<Leave[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [pw, setPw] = useState('');
  const [docAlert, setDocAlert] = useState(0);

  const caregiverId = me?.caregiverId;
  const load = useCallback(async () => {
    const [n, l, d] = await Promise.all([
      supabase.from('notifications').select('id,title,message,read,timestamp').order('timestamp', { ascending: false }).limit(15),
      supabase.from('time_off_requests').select('id,start_date,end_date,status,reason').order('requested_at', { ascending: false }).limit(8),
      caregiverId
        ? supabase.from('documents').select('id,category,expiry_date,status,created_at').eq('caregiver_id', caregiverId)
        : Promise.resolve({ data: [] as { id: string; category: string; expiry_date: string | null; status: 'pending_review' | 'approved' | 'rejected'; created_at: string }[] }),
    ]);
    const today = localDate(new Date(), org.timezone);
    setDocAlert(needsRenewal(d.data ?? [], today).length);
    setNotes((n.data ?? []) as Note[]);
    setLeave((l.data ?? []) as Leave[]);
    void refreshOnboarding();
  }, [refreshOnboarding, caregiverId, org.timezone]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)));
  }

  async function requestLeave() {
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(from) || !ymd.test(to) || to < from) return Alert.alert('Check the dates', 'Use the format YYYY-MM-DD, and make the end date the same as or after the start.');
    const { error } = await supabase.from('time_off_requests').insert({ caregiver_id: me?.caregiverId, start_date: from, end_date: to, reason: reason.trim() || null });
    if (error) return Alert.alert('Could not send the request', error.message);
    setFrom(''); setTo(''); setReason('');
    await load();
  }

  async function changePassword() {
    if (pw.length < 8) return Alert.alert('Too short', 'Use at least 8 characters.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return Alert.alert('Could not change password', error.message);
    setPw('');
    Alert.alert('Password changed');
  }

  const incomplete = onboarding && !onboarding.complete;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SPACE, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <ProfilePhoto name={me?.name} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{me?.name}</Text>
          <Muted>{session?.user.email}</Muted>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {org.logoUrl && <Image source={{ uri: org.logoUrl }} style={{ width: 18, height: 18 }} resizeMode="contain" accessibilityLabel={`${org.name} logo`} />}
            <Muted>{org.name}</Muted>
          </View>
        </Card>

        {incomplete && <Banner tone="warn" text={`Onboarding: ${onboarding.approved_steps} of ${onboarding.required_steps} required steps done.`} />}
        <Button title="Onboarding checklist" kind={incomplete ? 'primary' : 'outline'} onPress={() => router.push('/onboarding')} />

        {docAlert > 0 && <Banner tone="warn" text={`${docAlert} of your documents ${docAlert === 1 ? 'has expired or expires' : 'have expired or expire'} soon. Upload a renewed copy.`} />}
        <Button title="My documents" kind={docAlert > 0 ? 'primary' : 'outline'} onPress={() => router.push('/documents')} />

        <Card>
          <Label>Notifications</Label>
          {notes.length === 0 && <Muted>Nothing new.</Muted>}
          {notes.map((n) => (
            <View key={n.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontWeight: n.read ? '400' : '700' }} onPress={() => void markRead(n.id)}>{n.title}</Text>
              <Muted>{n.message}</Muted>
            </View>
          ))}
        </Card>

        <Card>
          <Label>Request time off</Label>
          <Input value={from} onChangeText={setFrom} placeholder="From (YYYY-MM-DD)" autoCapitalize="none" />
          <Input value={to} onChangeText={setTo} placeholder="To (YYYY-MM-DD)" autoCapitalize="none" />
          <Input value={reason} onChangeText={setReason} placeholder="Reason (optional)" />
          <Button title="Send request" kind="outline" onPress={requestLeave} disabled={!from || !to} />
          {leave.map((l) => <Muted key={l.id}>{formatDay(l.start_date, 'UTC')} to {formatDay(l.end_date, 'UTC')}: {l.status}</Muted>)}
        </Card>

        <Card>
          <Label>Change password</Label>
          <Input value={pw} onChangeText={setPw} secureTextEntry placeholder="New password (8+ characters)" autoComplete="new-password" />
          <Button title="Change password" kind="outline" onPress={changePassword} disabled={pw.length < 8} />
        </Card>

        <TwoFactorCard />

        <Button title="Sign out" kind="danger" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}
