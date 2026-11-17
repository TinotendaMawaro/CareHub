import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, SectionList, Text, View } from 'react-native';
import { Button, Card, Empty, Muted, Pill, Screen, TAB_BAR_SPACE, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { formatDateTime, formatDay, formatTime, hoursLabel, localDate } from '@/lib/format';
import { parseError, rpc, supabase } from '@/lib/supabase';

export type ShiftRow = {
  id: string; start_time: string; end_time: string; status: string; is_sleepover: boolean; ratio: string;
  approval_status: string; reject_reason: string | null; shift_publish_state: string | null; notes: string | null;
  sites: { name: string } | null;
  shift_workers: { caregiver_id: string; clock_in_time: string | null; clock_out_time: string | null }[];
  shift_clients: { clients: { first_name: string; last_name: string; address: string | null } | null }[];
};

export const SHIFT_SELECT =
  'id,start_time,end_time,status,is_sleepover,ratio,approval_status,reject_reason,shift_publish_state,notes,' +
  'sites(name),shift_workers(caregiver_id,clock_in_time,clock_out_time),shift_clients(clients(first_name,last_name,address))';

export function clientNames(s: ShiftRow): string {
  return s.shift_clients.map((c) => `${c.clients?.first_name ?? ''} ${c.clients?.last_name ?? ''}`.trim()).filter(Boolean).join(', ');
}

function statusPill(s: ShiftRow, mine?: ShiftRow['shift_workers'][number]) {
  if (s.approval_status === 'rejected') return <Pill text="Needs attention" tone="danger" />;
  if (mine?.clock_out_time) return <Pill text="Finished" tone="ok" />;
  if (mine?.clock_in_time) return <Pill text="In progress" tone="brand" />;
  if (s.status === 'Cancelled') return <Pill text="Cancelled" tone="danger" />;
  if (s.status === 'Late') return <Pill text="Start now" tone="warn" />;
  if (s.status === 'No Show') return <Pill text="Missed" tone="danger" />;
  return <Pill text="Scheduled" tone="muted" />;
}

export default function MyShifts() {
  const router = useRouter();
  const { me, org } = useSession();
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [open, setOpen] = useState<ShiftRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const from = new Date(Date.now() - 36 * 3_600_000).toISOString();
    const to = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('shifts').select(SHIFT_SELECT).eq('deleted', false).neq('status', 'Cancelled')
      .gte('end_time', from).lte('start_time', to).order('start_time');
    if (error) Alert.alert('Could not load shifts', error.message);
    const all = (data ?? []) as unknown as ShiftRow[];
    setRows(all.filter((s) => s.shift_workers.length > 0));
    setOpen(all.filter((s) => s.shift_workers.length === 0 && s.shift_publish_state === 'offered'));
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const ch = supabase.channel(`my-shifts-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_workers' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  async function accept(s: ShiftRow) {
    try {
      await rpc('accept_offered_shift', { p_shift: s.id });
      await load();
    } catch (e) {
      Alert.alert('Could not take this shift', parseError(e).message);
      await load();
    }
  }

  const today = localDate(new Date(), org.timezone);
  const live = rows.filter((s) => s.shift_workers.some((w) => w.clock_in_time && !w.clock_out_time));
  const todays = rows.filter((s) => !live.includes(s) && localDate(s.start_time, org.timezone) === today);
  const upcoming = rows.filter((s) => !live.includes(s) && !todays.includes(s) && s.start_time > new Date().toISOString());
  const recent = rows.filter((s) => !live.includes(s) && !todays.includes(s) && !upcoming.includes(s));

  const sections = [
    { title: 'In progress', data: live }, { title: 'Today', data: todays }, { title: 'Upcoming', data: upcoming },
    { title: 'Open shifts you can take', data: open, open: true }, { title: 'Recent', data: recent },
  ].filter((x) => x.data.length > 0);

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SPACE, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={loaded ? <Empty text="No shifts coming up. Pull down to refresh." /> : undefined}
        renderSectionHeader={({ section }) => (
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>{section.title}</Text>
        )}
        renderItem={({ item: s, section }) => {
          const mine = s.shift_workers.find((w) => w.caregiver_id === me?.caregiverId);
          return (
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                  {formatDay(s.start_time, org.timezone)} {formatTime(s.start_time, org.timezone)}-{formatTime(s.end_time, org.timezone)}
                </Text>
                {'open' in section ? <Pill text="Open" tone="brand" /> : statusPill(s, mine)}
              </View>
              <Text style={{ color: colors.text }}>{clientNames(s) || 'Participant'}</Text>
              <Muted>
                {s.sites?.name ? `${s.sites.name} | ` : ''}{hoursLabel(s.start_time, s.end_time)}{s.is_sleepover ? ' | Sleepover' : ''}{s.shift_clients.length > 1 ? ` | ${s.shift_clients.length} participants` : ''}
              </Muted>
              {s.reject_reason && <Text style={{ color: colors.danger }}>Office: {s.reject_reason}</Text>}
              {'open' in section ? (
                <Button title="Take this shift" onPress={() => accept(s)} style={{ marginTop: 6 }} />
              ) : (
                <Button title={mine?.clock_in_time && !mine.clock_out_time ? 'Open shift' : 'View'} kind="outline" onPress={() => router.push({ pathname: '/shift/[id]', params: { id: s.id } })} style={{ marginTop: 6 }} />
              )}
            </Card>
          );
        }}
      />
    </Screen>
  );
}
