import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card, Empty, Muted, Pill, Screen, TAB_BAR_SPACE, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { formatDay, formatTime, money } from '@/lib/format';
import { parseError, rpc, supabase } from '@/lib/supabase';

type TS = { id: string; status: string; reject_reason: string | null; pay_period: { period_start: string; period_end: string } };
type Totals = { timesheet_id: string; completed_shifts: number; pending_shifts: number; approved_hours: number; total_gross: number };
type Line = { id: string; start_time: string; end_time: string; approved_at: string | null; status: string; shift_workers: { hours_worked: number | null; approved_hours: number | null }[] };

const TONE = { draft: 'muted', submitted: 'warn', approved: 'ok', rejected: 'danger', exported: 'ok', paid: 'ok' } as const;

export default function Timesheets() {
  const { me, org } = useSession();
  const [sheets, setSheets] = useState<TS[]>([]);
  const [totals, setTotals] = useState<Record<string, Totals>>({});
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('timesheets').select('id,status,reject_reason,pay_period:pay_periods(period_start,period_end)').order('created_at', { ascending: false }).limit(12);
    const list = (data ?? []) as unknown as TS[];
    setSheets(list);
    if (list.length) {
      const { data: t } = await supabase.from('timesheet_totals').select('timesheet_id,completed_shifts,pending_shifts,approved_hours,total_gross').in('timesheet_id', list.map((x) => x.id));
      setTotals(Object.fromEntries(((t ?? []) as Totals[]).map((x) => [x.timesheet_id, x])));
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function toggle(ts: TS) {
    if (openId === ts.id) return setOpenId(null);
    setOpenId(ts.id);
    if (lines[ts.id]) return;
    const { data } = await supabase.from('shifts')
      .select('id,start_time,end_time,approved_at,status,shift_workers!inner(hours_worked,approved_hours)')
      .eq('shift_workers.caregiver_id', me?.caregiverId ?? '').eq('deleted', false).neq('status', 'Cancelled')
      .gte('date', ts.pay_period.period_start).lte('date', ts.pay_period.period_end).order('start_time');
    setLines((l) => ({ ...l, [ts.id]: (data ?? []) as unknown as Line[] }));
  }

  async function submit(ts: TS) {
    try { await rpc('submit_timesheet', { p_ts: ts.id }); await load(); Alert.alert('Submitted', 'Your timesheet is with the office.'); }
    catch (e) { Alert.alert('Could not submit', parseError(e).message); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SPACE, gap: 10 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {sheets.length === 0 && <Empty text="No timesheets yet. The office creates one for each pay period." />}
        {sheets.map((ts) => {
          const t = totals[ts.id];
          return (
            <Card key={ts.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{formatDay(ts.pay_period.period_start, 'UTC')} to {formatDay(ts.pay_period.period_end, 'UTC')}</Text>
                <Pill text={ts.status} tone={TONE[ts.status as keyof typeof TONE] ?? 'muted'} />
              </View>
              <Muted>{t ? `${Number(t.approved_hours).toFixed(2)} approved hours | ${t.completed_shifts} shifts approved${t.pending_shifts ? ` | ${t.pending_shifts} waiting for approval` : ''}` : ' '}</Muted>
              {t && ['approved', 'exported', 'paid'].includes(ts.status) && <Text style={{ color: colors.text, fontWeight: '600' }}>Gross pay {money(t.total_gross, org.currency)}</Text>}
              {ts.reject_reason && <Text style={{ color: colors.danger }}>Office: {ts.reject_reason}</Text>}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Button title={openId === ts.id ? 'Hide shifts' : 'See shifts'} kind="outline" onPress={() => toggle(ts)} style={{ flex: 1 }} />
                {['draft', 'rejected'].includes(ts.status) && <Button title="Submit" onPress={() => submit(ts)} style={{ flex: 1 }} />}
              </View>
              {openId === ts.id && (lines[ts.id] ?? []).map((l) => (
                <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6 }}>
                  <Text style={{ color: colors.text }}>{formatDay(l.start_time, org.timezone)} {formatTime(l.start_time, org.timezone)}-{formatTime(l.end_time, org.timezone)}</Text>
                  <Muted>{l.approved_at ? `${Number(l.shift_workers[0]?.approved_hours ?? 0).toFixed(2)} h approved` : `${l.status}`}</Muted>
                </View>
              ))}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
