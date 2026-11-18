import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Empty, Input, Muted, Screen, TAB_BAR_SPACE, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { parseError, rpc, supabase } from '@/lib/supabase';

type Chan = { channel_id: string; name: string | null; kind: 'channel' | 'group' | 'dm'; is_private: boolean; unread: number; last_message_at: string | null; dm_user_id: string | null };
type Person = { id: string; name: string; role: string };

export default function ChatList() {
  const router = useRouter();
  const { session } = useSession();
  const [chans, setChans] = useState<Chan[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [joinable, setJoinable] = useState<{ id: string; name: string }[]>([]);
  const [picker, setPicker] = useState<null | 'dm' | 'group'>(null);
  const [groupName, setGroupName] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [c, p, j] = await Promise.all([
      supabase.from('chat_overview').select('*'),
      supabase.from('staff_directory').select('id,name,role').order('name'),
      supabase.from('chat_channels').select('id,name').eq('kind', 'channel').eq('is_private', false),
    ]);
    const list = ((c.data ?? []) as Chan[]).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
    setChans(list);
    setPeople(((p.data ?? []) as Person[]).filter((x) => x.id !== session?.user.id));
    const mine = new Set(list.map((x) => x.channel_id));
    setJoinable(((j.data ?? []) as { id: string; name: string }[]).filter((x) => !mine.has(x.id)));
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const ch = supabase.channel(`chat-list-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? 'Someone';
  const open = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });
  const fail = (e: unknown) => Alert.alert('Could not do that', parseError(e).message);

  async function startDm(userId: string) {
    try { const id = await rpc<string>('get_or_create_dm', { p_other: userId }); setPicker(null); open(id); } catch (e) { fail(e); }
  }
  async function createGroup() {
    try {
      const id = await rpc<string>('create_channel', { p_name: groupName.trim(), p_kind: 'group', p_members: chosen, p_private: true, p_description: null });
      setPicker(null); setGroupName(''); setChosen([]); open(id);
    } catch (e) { fail(e); }
  }
  async function join(id: string) {
    try { await rpc('join_channel', { p_channel: id }); await load(); open(id); } catch (e) { fail(e); }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 }}>
        <Button title="New message" onPress={() => setPicker('dm')} style={{ flex: 1 }} />
        <Button title="New group" kind="outline" onPress={() => setPicker('group')} style={{ flex: 1 }} />
      </View>
      <FlatList
        data={chans}
        keyExtractor={(c) => c.channel_id}
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SPACE, gap: 8 }}
        ListEmptyComponent={<Empty text="No conversations yet." />}
        ListFooterComponent={joinable.length ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Muted>Channels you can join</Muted>
            {joinable.map((j) => <Button key={j.id} title={`# ${j.name}  (join)`} kind="outline" onPress={() => join(j.id)} />)}
          </View>
        ) : undefined}
        renderItem={({ item: c }) => (
          <Pressable onPress={() => open(c.channel_id)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: c.unread ? '700' : '500', color: colors.text, flex: 1 }}>
                {c.kind === 'dm' ? nameOf(c.dm_user_id) : `${c.is_private ? '' : '# '}${c.name}`}
              </Text>
              {c.unread > 0 && (
                <View style={{ backgroundColor: colors.danger, borderRadius: 999, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{c.unread}</Text>
                </View>
              )}
            </Card>
          </Pressable>
        )}
      />

      <Modal visible={!!picker} animationType="slide" onRequestClose={() => setPicker(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{picker === 'dm' ? 'Message someone' : 'New private group'}</Text>
            {picker === 'group' && <Input value={groupName} onChangeText={setGroupName} placeholder="Group name" />}
            {people.map((p) => {
              const on = chosen.includes(p.id);
              return (
                <Pressable key={p.id} onPress={() => (picker === 'dm' ? void startDm(p.id) : setChosen(on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id]))}>
                  <Card style={{ flexDirection: 'row', justifyContent: 'space-between', borderColor: on ? colors.text : colors.border }}>
                    <Text style={{ color: colors.text, fontSize: 16 }}>{p.name}</Text>
                    <Muted>{on ? 'Added' : p.role === 'caregiver' ? 'Staff' : 'Office'}</Muted>
                  </Card>
                </Pressable>
              );
            })}
            {picker === 'group' && <Button title="Create group" onPress={createGroup} disabled={!groupName.trim() || chosen.length === 0} />}
            <Button title="Close" kind="outline" onPress={() => setPicker(null)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}
