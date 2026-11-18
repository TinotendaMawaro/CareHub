import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, H1, Input, Label, Muted, Pill, Screen, colors } from '@/components/ui';
import { DocRow } from '@/components/documents';
import { useSession } from '@/hooks/use-session';
import { DOC_SELECT, type Doc } from '@/lib/documents';
import { formatDay, formatTime, hoursLabel, localDate } from '@/lib/format';
import { parseError, rpc, supabase } from '@/lib/supabase';

type Client = { id: string; first_name: string; last_name: string; address: string | null; allergies: string[]; care_plan: string | null; emergency_contact: string | null; phone: string | null };
type Shift = {
  id: string; start_time: string; end_time: string; status: string; is_sleepover: boolean; ratio: string; notes: string | null;
  approval_status: string; reject_reason: string | null; approved_at: string | null; geofence_required: boolean | null;
  sites: { name: string; address: string | null } | null;
  shift_clients: { clients: Client | null }[];
  shift_workers: { caregiver_id: string; clock_in_time: string | null; clock_out_time: string | null; hours_worked: number | null }[];
};
type Note = { id: string; client_id: string; note: string; category: string; follow_up: boolean; timestamp: string };

const CATEGORIES = ['general', 'medication', 'mood', 'meal', 'activity', 'health', 'handover'] as const;

async function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null };
  } catch {
    return null;
  }
}

const fetchShift = (id: string, caregiverId: string) =>
  Promise.all([
    supabase.from('shifts')
      .select('id,start_time,end_time,status,is_sleepover,ratio,notes,approval_status,reject_reason,approved_at,geofence_required,sites(name,address),shift_clients(clients(id,first_name,last_name,address,allergies,care_plan,emergency_contact,phone)),shift_workers(caregiver_id,clock_in_time,clock_out_time,hours_worked)')
      .eq('id', id).maybeSingle(),
    supabase.from('shift_team').select('caregiver_id,name,role').eq('shift_id', id),
    supabase.from('shift_notes').select('id,client_id,note,category,follow_up,timestamp').eq('shift_id', id).eq('caregiver_id', caregiverId).order('timestamp', { ascending: false }),
    // Row level security limits this to participants this worker supports.
    supabase.from('documents').select(DOC_SELECT).not('client_id', 'is', null).order('category'),
  ]);

export default function ShiftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, org } = useSession();
  const [shift, setShift] = useState<Shift | null>(null);
  const [team, setTeam] = useState<{ caregiver_id: string; name: string; role: string }[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState<'start' | 'end' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brk, setBrk] = useState('0');

  const caregiverId = me?.caregiverId ?? '';
  const apply = useCallback(([s, t, n, d]: Awaited<ReturnType<typeof fetchShift>>) => {
    setShift(s.data as unknown as Shift | null);
    setTeam((t.data ?? []) as typeof team);
    setNotes((n.data ?? []) as Note[]);
    setDocs((d.data ?? []) as Doc[]);
  }, []);
  const load = useCallback(async () => apply(await fetchShift(id, caregiverId)), [id, caregiverId, apply]);

  useEffect(() => {
    let alive = true;
    void fetchShift(id, caregiverId).then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [id, caregiverId, apply]);

  const mine = shift?.shift_workers.find((w) => w.caregiver_id === me?.caregiverId);
  const locked = !!shift?.approved_at;
  const clients = (shift?.shift_clients ?? []).map((c) => c.clients).filter((c): c is Client => !!c);

  async function start() {
    setError(null);
    setBusy('start');
    try {
      const pos = await currentPosition();
      await rpc('start_shift', { p_shift: id, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_accuracy: pos?.accuracy ?? null });
      await load();
    } catch (e) {
      setError(parseError(e).message);
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    setError(null);
    const minutes = Math.max(0, parseInt(brk, 10) || 0);
    setBusy('end');
    try {
      const pos = await currentPosition();
      const r = await rpc<{ hours_worked: number }>('end_shift', { p_shift: id, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_break_minutes: minutes });
      await load();
      Alert.alert('Shift finished', `You worked ${Number(r.hours_worked ?? 0).toFixed(2)} hours. The office will approve it.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      setError(parseError(e).message);
    } finally {
      setBusy(null);
    }
  }

  function confirmEnd() {
    Alert.alert('End this shift?', 'Make sure your notes are written. You cannot undo this.', [
      { text: 'Not yet', style: 'cancel' }, { text: 'End shift', style: 'destructive', onPress: () => void finish() },
    ]);
  }

  if (!shift) return <Screen><Muted style={{ padding: 16 }}>Loading...</Muted></Screen>;

  const started = !!mine?.clock_in_time;
  const ended = !!mine?.clock_out_time;
  const address = shift.sites?.address ?? clients[0]?.address ?? null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <H1>{formatDay(shift.start_time, org.timezone)}, {formatTime(shift.start_time, org.timezone)}-{formatTime(shift.end_time, org.timezone)}</H1>
          <Muted>{hoursLabel(shift.start_time, shift.end_time)} | {shift.is_sleepover ? 'Sleepover' : 'Active'} | ratio {shift.ratio}</Muted>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            {ended ? <Pill text="You finished" tone="ok" /> : started ? <Pill text="In progress" tone="brand" /> : <Pill text={shift.status} tone="muted" />}
            {locked && <Pill text="Approved" tone="ok" />}
          </View>
        </View>

        {shift.reject_reason && <Banner tone="warn" text={`The office sent this back: ${shift.reject_reason}`} />}
        {shift.notes && <Banner tone="warn" text={`Note from the office: ${shift.notes}`} />}

        {address && (
          <Card>
            <Label>Where</Label>
            <Text style={{ color: colors.text }}>{shift.sites?.name ? `${shift.sites.name}, ` : ''}{address}</Text>
            <Button title="Open in Maps" kind="outline" onPress={() => void Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`)} />
          </Card>
        )}

        {team.length > 1 && (
          <Card>
            <Label>Working with</Label>
            {team.filter((t) => t.caregiver_id !== me?.caregiverId).map((t) => <Text key={t.caregiver_id} style={{ color: colors.text }}>{t.name}</Text>)}
          </Card>
        )}

        {error && <Banner text={error} />}

        {!started && !ended && (
          <Button title="Start shift" onPress={start} loading={busy === 'start'} disabled={shift.status === 'Cancelled'} />
        )}
        {!started && !ended && shift.geofence_required !== false && (
          <Muted>Starting needs your location: you must be at the client&apos;s address.</Muted>
        )}

        {clients.map((c) => (
          <ParticipantCard
            key={c.id} client={c} shiftId={shift.id} started={started} disabled={locked}
            notes={notes.filter((n) => n.client_id === c.id)} onSaved={load}
            docs={docs.filter((d) => d.client_id === c.id)}
            onIncident={() => router.push({ pathname: '/incident/new', params: { shiftId: shift.id, clientId: c.id } })}
          />
        ))}

        {started && !ended && (
          <Card>
            <Label>Unpaid break taken (minutes)</Label>
            <Input value={brk} onChangeText={setBrk} keyboardType="number-pad" style={{ width: 120 }} />
            <Button title="End shift" kind="danger" onPress={confirmEnd} loading={busy === 'end'} style={{ marginTop: 8 }} />
          </Card>
        )}
        {ended && <Banner tone="ok" text={`You worked ${Number(mine?.hours_worked ?? 0).toFixed(2)} hours on this shift.`} />}
      </ScrollView>
    </Screen>
  );
}

function ParticipantCard({
  client, shiftId, started, disabled, notes, docs, onSaved, onIncident,
}: { client: Client; shiftId: string; started: boolean; disabled: boolean; notes: Note[]; docs: Doc[]; onSaved: () => Promise<void>; onIncident: () => void }) {
  const { me, org } = useSession();
  const today = localDate(new Date(), org.timezone);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('general');
  const [follow, setFollow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function save() {
    if (!text.trim() || !me) return;
    setSaving(true);
    const { error } = await supabase.from('shift_notes').insert({
      shift_id: shiftId, client_id: client.id, caregiver_id: me.caregiverId, note: text.trim(), category, follow_up: follow,
    });
    setSaving(false);
    if (error) return Alert.alert('Could not save the note', error.message);
    setText(''); setFollow(false); setCategory('general');
    await onSaved();
  }

  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button">
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{client.first_name} {client.last_name}</Text>
        <Muted>{open ? 'Hide details' : `Tap for care details${docs.length ? ` and ${docs.length} document${docs.length === 1 ? '' : 's'}` : ''}`}</Muted>
      </Pressable>
      {open && (
        <View style={{ gap: 4 }}>
          {client.allergies.length > 0 && <Banner tone="warn" text={`Allergies: ${client.allergies.join(', ')}`} />}
          {client.care_plan ? <Text style={{ color: colors.text }}>{client.care_plan}</Text> : <Muted>No care plan recorded.</Muted>}
          {client.emergency_contact && <Muted>Emergency contact: {client.emergency_contact}</Muted>}
          {docs.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Label>Documents</Label>
              {docs.map((d) => <DocRow key={d.id} doc={d} today={today} showStatus={false} />)}
            </View>
          )}
        </View>
      )}

      <Label>Shift notes{notes.length ? ` (${notes.length})` : ''}</Label>
      {notes.map((n) => (
        <View key={n.id} style={{ backgroundColor: '#f1f5f9', borderRadius: 8, padding: 8 }}>
          <Muted>{formatTime(n.timestamp)} | {n.category}{n.follow_up ? ' | follow up' : ''}</Muted>
          <Text style={{ color: colors.text }}>{n.note}</Text>
        </View>
      ))}
      {started && !disabled && (
        <View style={{ gap: 8 }}>
          <Input value={text} onChangeText={setText} multiline placeholder={`What happened with ${client.first_name}? Be factual.`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: category === c ? colors.text : colors.border, backgroundColor: category === c ? colors.text : '#fff' }}>
                <Text style={{ color: category === c ? '#fff' : colors.text, fontSize: 13 }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setFollow(!follow)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.text, backgroundColor: follow ? colors.text : '#fff' }} />
            <Text style={{ color: colors.text }}>Needs follow-up from the office</Text>
          </Pressable>
          <Button title="Save note" onPress={save} loading={saving} disabled={!text.trim()} />
          <Button title="Report an incident" kind="outline" onPress={onIncident} />
        </View>
      )}
      {!started && <Muted>Start the shift to write notes.</Muted>}
    </Card>
  );
}
