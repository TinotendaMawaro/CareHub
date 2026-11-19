import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, H1, Input, Label, Muted, Pill, Screen, colors } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { SignaturePad, type Signature } from '@/components/signature-pad';
import { formatTime } from '@/lib/format';
import { parseError, rpc, supabase } from '@/lib/supabase';

export type Attachment = { id: string; name: string; path: string; mime: string; size_bytes: number };
type Trip = { id: string; trip_kind: 'to_shift' | 'in_shift' | 'return' | null; distance: number; purpose: string | null; vehicle_type: string | null; odometer_start: number | null; odometer_end: number | null };
type SignatureRow = { signer: 'client' | 'worker'; signer_name: string; signed_at: string };

const TRIP_KINDS = [
  { value: 'to_shift', label: 'To the shift' },
  { value: 'in_shift', label: 'During' },
  { value: 'return', label: 'Home' },
] as const;

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.text : '#cbd5e1', backgroundColor: on ? colors.text : '#fff' }}>
      <Text style={{ color: on ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------------------------------------------- */

/** The office asked this worker to confirm. Confirming keeps the shift; declining hands it back. */
export function ConfirmCard({ shiftId, onConfirmed, onDeclined }: { shiftId: string; onConfirmed: () => void; onDeclined: () => void }) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  async function respond(accept: boolean) {
    setBusy(accept ? 'yes' : 'no');
    try {
      await rpc('respond_to_shift', { p_shift: shiftId, p_accept: accept, p_reason: accept ? null : reason.trim() || null });
      if (accept) onConfirmed();
      else Alert.alert('Shift declined', 'The office has been told so they can find someone else.', [{ text: 'OK', onPress: onDeclined }]);
    } catch (e) {
      Alert.alert('Could not send your reply', parseError(e).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ borderWidth: 2, borderColor: colors.warn }}>
      <Label>Can you do this shift?</Label>
      <Muted>The office asked you to confirm.</Muted>
      {!declining ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button title="Yes, I'll be there" onPress={() => void respond(true)} loading={busy === 'yes'} style={{ flex: 1 }} />
          <Button title="I can't" kind="outline" onPress={() => setDeclining(true)} style={{ flex: 1 }} />
        </View>
      ) : (
        <View style={{ gap: 8, marginTop: 6 }}>
          <Input value={reason} onChangeText={setReason} placeholder="Reason (optional), e.g. away that day" maxLength={200} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Decline shift" kind="danger" onPress={() => void respond(false)} loading={busy === 'no'} style={{ flex: 1 }} />
            <Button title="Back" kind="outline" onPress={() => setDeclining(false)} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function InstructionsCard({ text, files }: { text: string | null; files: Attachment[] }) {
  const [opening, setOpening] = useState<string | null>(null);
  if (!text?.trim() && files.length === 0) return null;

  async function open(f: Attachment) {
    setOpening(f.id);
    const { data, error } = await supabase.storage.from('shift-files').createSignedUrl(f.path, 300);
    setOpening(null);
    if (error || !data) return Alert.alert('Could not open the file', error?.message ?? 'Try again.');
    await Linking.openURL(data.signedUrl);
  }

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.warn }}>
      <Label>Instructions from the office</Label>
      {text?.trim() ? <RichText text={text} /> : null}
      {files.length > 0 && (
        <View style={{ gap: 6, marginTop: 4 }}>
          {files.map((f) => (
            <Pressable key={f.id} onPress={() => void open(f)} accessibilityRole="link" accessibilityLabel={`Open ${f.name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', opacity: opening === f.id ? 0.5 : 1 }}>
              <Text style={{ fontSize: 18 }}>{f.mime.startsWith('image/') ? '🖼️' : '📄'}</Text>
              <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }} numberOfLines={1}>{f.name}</Text>
              <Muted>{fileSize(f.size_bytes)}</Muted>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------- */

export function TripsCard({ shiftId, canEdit }: { shiftId: string; canEdit: boolean }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof TRIP_KINDS)[number]['value']>('to_shift');
  const [mode, setMode] = useState<'km' | 'odo'>('km');
  const [km, setKm] = useState('');
  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [vehicle, setVehicle] = useState('Own car');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('mileage').select('id,trip_kind,distance,purpose,vehicle_type,odometer_start,odometer_end').eq('shift_id', shiftId).order('created_at');
    return (data ?? []) as Trip[];
  }, [shiftId]);
  useEffect(() => {
    let alive = true;
    void load().then((t) => { if (alive) setTrips(t); });
    return () => { alive = false; };
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      await rpc('log_trip', {
        p_shift: shiftId, p_kind: kind,
        p_km: mode === 'km' ? Number(km.replace(',', '.')) : null,
        p_vehicle: vehicle, p_purpose: purpose || null,
        p_odometer_start: mode === 'odo' ? Number(odoStart) : null,
        p_odometer_end: mode === 'odo' ? Number(odoEnd) : null,
      });
      setKm(''); setOdoStart(''); setOdoEnd(''); setPurpose(''); setOpen(false);
      setTrips(await load());
    } catch (e) {
      Alert.alert('Could not save the trip', parseError(e).message);
    } finally {
      setBusy(false);
    }
  }

  function remove(t: Trip) {
    Alert.alert('Remove this trip?', `${Number(t.distance).toFixed(1)} km`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await rpc('delete_trip', { p_id: t.id }); setTrips(await load()); }
        catch (e) { Alert.alert('Could not remove it', parseError(e).message); }
      } },
    ]);
  }

  const total = trips.reduce((a, t) => a + Number(t.distance), 0);
  const ready = mode === 'km' ? Number(km.replace(',', '.')) > 0 : Number(odoEnd) > Number(odoStart) && odoStart !== '';

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>Travel{trips.length ? ` (${total.toFixed(1)} km)` : ''}</Label>
        {canEdit && !open && <Pressable onPress={() => setOpen(true)} accessibilityRole="button"><Text style={{ color: '#2563eb', fontWeight: '700' }}>+ Log a trip</Text></Pressable>}
      </View>
      {trips.length === 0 && !open && <Muted>Log kilometres driven to the shift, during it with the client, and home.</Muted>}
      {trips.map((t) => (
        <Pressable key={t.id} onLongPress={() => canEdit && remove(t)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
          <Text style={{ color: colors.text, flex: 1 }}>
            {TRIP_KINDS.find((k) => k.value === t.trip_kind)?.label ?? 'Trip'}{t.purpose ? ` · ${t.purpose}` : ''}
          </Text>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{Number(t.distance).toFixed(1)} km</Text>
        </Pressable>
      ))}
      {trips.length > 0 && canEdit && !open && <Muted>Press and hold a trip to remove it.</Muted>}
      {open && (
        <View style={{ gap: 8, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TRIP_KINDS.map((k) => <Chip key={k.value} label={k.label} on={kind === k.value} onPress={() => setKind(k.value)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="Distance" on={mode === 'km'} onPress={() => setMode('km')} />
            <Chip label="Odometer" on={mode === 'odo'} onPress={() => setMode('odo')} />
          </View>
          {mode === 'km' ? (
            <Input value={km} onChangeText={setKm} keyboardType="decimal-pad" placeholder="Kilometres, e.g. 12.5" />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Input value={odoStart} onChangeText={setOdoStart} keyboardType="number-pad" placeholder="Start reading" style={{ flex: 1 }} />
              <Input value={odoEnd} onChangeText={setOdoEnd} keyboardType="number-pad" placeholder="End reading" style={{ flex: 1 }} />
            </View>
          )}
          <Input value={vehicle} onChangeText={setVehicle} placeholder="Vehicle" maxLength={60} />
          <Input value={purpose} onChangeText={setPurpose} placeholder="What for (optional), e.g. shopping with the client" maxLength={120} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Save trip" onPress={() => void save()} loading={busy} disabled={!ready} style={{ flex: 1 }} />
            <Button title="Cancel" kind="outline" onPress={() => setOpen(false)} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------- */

/** Sign-off before ending: the client and/or the worker sign on the phone. */
export function SignOffCard({ shiftId, needClient, needWorker, clientName, workerName, canSign, onChanged }: {
  shiftId: string; needClient: boolean; needWorker: boolean; clientName: string; workerName: string; canSign: boolean;
  onChanged: (missing: number) => void;
}) {
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [signing, setSigning] = useState<'client' | 'worker' | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('shift_signatures').select('signer,signer_name,signed_at').eq('shift_id', shiftId);
    return (data ?? []) as SignatureRow[];
  }, [shiftId]);
  useEffect(() => {
    let alive = true;
    void load().then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [load]);

  const has = (who: 'client' | 'worker') => rows.find((r) => r.signer === who);
  const missing = (needClient && !has('client') ? 1 : 0) + (needWorker && !has('worker') ? 1 : 0);
  useEffect(() => { onChanged(missing); }, [missing, onChanged]);
  if (!needClient && !needWorker) return null;

  const line = (who: 'client' | 'worker', label: string) => {
    const r = has(who);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
          {r ? <Muted>Signed by {r.signer_name} at {formatTime(r.signed_at)}</Muted> : <Muted>Not signed yet</Muted>}
        </View>
        {r ? <Pill text="Signed" tone="ok" /> : <Pill text="Required" tone="warn" />}
        {canSign && <Button title={r ? 'Redo' : 'Sign'} kind={r ? 'outline' : 'primary'} onPress={() => setSigning(who)} />}
      </View>
    );
  };

  return (
    <Card>
      <Label>Sign-off</Label>
      {needClient && line('client', 'Client signature')}
      {needWorker && line('worker', 'Your signature')}
      {!canSign && missing > 0 && <Muted>Signatures are collected at the end of the shift.</Muted>}
      <SignModal
        who={signing}
        shiftId={shiftId}
        defaultName={signing === 'client' ? clientName : workerName}
        onClose={() => setSigning(null)}
        onSaved={async () => { setSigning(null); setRows(await load()); }}
      />
    </Card>
  );
}

function SignModal({ who, shiftId, defaultName, onClose, onSaved }: {
  who: 'client' | 'worker' | null; shiftId: string; defaultName: string; onClose: () => void; onSaved: () => void;
}) {
  return (
    <Modal visible={!!who} animationType="slide" onRequestClose={onClose}>
      {who && <SignForm key={who} who={who} shiftId={shiftId} defaultName={defaultName} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function SignForm({ who, shiftId, defaultName, onClose, onSaved }: {
  who: 'client' | 'worker'; shiftId: string; defaultName: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [sig, setSig] = useState<Signature | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!sig) return;
    setBusy(true);
    setError(null);
    try {
      await rpc('sign_shift', { p_shift: shiftId, p_signer: who, p_name: name, p_strokes: sig.strokes, p_width: sig.width, p_height: sig.height });
      onSaved();
    } catch (e) {
      setError(parseError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} scrollEnabled={false} keyboardShouldPersistTaps="handled">
        <H1>{who === 'client' ? 'Client signature' : 'Your signature'}</H1>
        <Muted>{who === 'client' ? 'Hand the phone to the client to confirm the support was delivered.' : 'Sign to confirm the shift details are correct.'}</Muted>
        <Label>Name</Label>
        <Input value={name} onChangeText={setName} placeholder="Full name" maxLength={120} />
        <SignaturePad onChange={setSig} />
        {error && <Banner text={error} />}
        <Button title="Save signature" onPress={() => void save()} loading={busy} disabled={!sig || !name.trim()} />
        <Button title="Cancel" kind="outline" onPress={onClose} />
      </ScrollView>
    </Screen>
  );
}
