import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Muted, Screen, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { formatTime } from '@/lib/format';
import { rpc, supabase } from '@/lib/supabase';

type Msg = { id: string; sender_id: string; body: string; created_at: string };

export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, org } = useSession();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('Chat');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const seen = useRef(new Set<string>());
  const me = session?.user.id;

  const markRead = useCallback(() => void rpc('mark_channel_read', { p_channel: id }).catch(() => {}), [id]);

  useEffect(() => {
    let active = true;
    seen.current = new Set();
    void (async () => {
      const [m, p, c] = await Promise.all([
        supabase.from('chat_messages').select('id,sender_id,body,created_at').eq('channel_id', id).eq('deleted', false).order('created_at', { ascending: false }).limit(100),
        supabase.from('staff_directory').select('id,name'),
        supabase.from('chat_overview').select('name,kind,dm_user_id').eq('channel_id', id).maybeSingle(),
      ]);
      if (!active) return;
      const list = (m.data ?? []) as Msg[]; // newest first, which is what an inverted list wants
      list.forEach((x) => seen.current.add(x.id));
      setMsgs(list);
      const map = Object.fromEntries(((p.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
      setNames(map);
      if (c.data) setTitle(c.data.kind === 'dm' ? map[c.data.dm_user_id ?? ''] ?? 'Message' : c.data.name ?? 'Chat');
      markRead();
    })();

    const ch = supabase.channel(`room-${id}-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${id}` }, (p) => {
        const row = p.new as Msg;
        if (seen.current.has(row.id)) return;
        seen.current.add(row.id);
        setMsgs((prev) => [row, ...prev]);
        if (row.sender_id !== me) markRead();
      })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(ch); };
  }, [id, me, markRead]);

  async function send() {
    const body = draft.trim();
    if (!body || !me) return;
    setSending(true);
    setDraft('');
    const { data, error } = await supabase.from('chat_messages').insert({ channel_id: id, sender_id: me, body }).select('id,sender_id,body,created_at').single();
    setSending(false);
    if (error) { setDraft(body); return Alert.alert('Message not sent', error.message); }
    if (!seen.current.has(data.id)) { seen.current.add(data.id); setMsgs((prev) => [data as Msg, ...prev]); }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          inverted
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] }}>No messages yet. Say hello.</Muted>}
          renderItem={({ item: m, index }) => {
            const mine = m.sender_id === me;
            const older = msgs[index + 1];
            const showName = !mine && (!older || older.sender_id !== m.sender_id);
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {showName && <Muted style={{ marginLeft: 6, marginBottom: 2 }}>{names[m.sender_id] ?? 'Someone'}</Muted>}
                <View style={{ maxWidth: '82%', backgroundColor: mine ? org.brandColor : '#e2e8f0', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: mine ? '#fff' : colors.text, fontSize: 16 }}>{m.body}</Text>
                  <Text style={{ color: mine ? '#ffffffb3' : colors.muted, fontSize: 11, marginTop: 2 }}>{formatTime(m.created_at, org.timezone)}</Text>
                </View>
              </View>
            );
          }}
        />
        <SafeAreaView edges={['bottom']} style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }}>
          <Input style={{ flex: 1 }} value={draft} onChangeText={setDraft} placeholder="Message" maxLength={4000} multiline />
          <Button title="Send" onPress={send} loading={sending} disabled={!draft.trim()} style={{ minWidth: 76 }} />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
