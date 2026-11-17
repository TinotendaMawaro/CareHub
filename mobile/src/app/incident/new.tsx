import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Banner, Button, Input, Label, Muted, Screen, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { localDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { uploadLocalFile } from '@/lib/upload';

const TYPES = ['Injury', 'Fall', 'Medication', 'Behaviour', 'Property damage', 'Abuse or neglect', 'Near miss', 'Other'];
const SEVERITIES = ['Low', 'Medium', 'High'] as const;

function Chips<T extends string>({ values, value, onChange }: { values: readonly T[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {values.map((v) => (
        <Pressable key={v} onPress={() => onChange(v)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: value === v ? colors.text : colors.border, backgroundColor: value === v ? colors.text : '#fff' }}>
          <Text style={{ color: value === v ? '#fff' : colors.text }}>{v}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function NewIncident() {
  const { shiftId, clientId } = useLocalSearchParams<{ shiftId?: string; clientId?: string }>();
  const router = useRouter();
  const { me, org } = useSession();
  const [type, setType] = useState<string | null>(null);
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number] | null>(null);
  const [description, setDescription] = useState('');
  const [actions, setActions] = useState('');
  const [involved, setInvolved] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; name: string; mime: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>('');

  useEffect(() => {
    if (!clientId) return;
    void supabase.from('clients').select('first_name,last_name').eq('id', clientId).maybeSingle()
      .then(({ data }) => setClientName(data ? `${data.first_name} ${data.last_name}` : ''));
  }, [clientId]);

  async function addPhoto(fromCamera: boolean) {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow access in your phone settings to attach photos.');
    const r = await (fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: 'images', quality: 0.6 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setPhotos((p) => [...p, { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mime: a.mimeType ?? 'image/jpeg' }].slice(0, 5));
  }

  async function submit() {
    if (!me || !type || description.trim().length < 5) return;
    setError(null);
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const p of photos) urls.push(await uploadLocalFile('incident-photos', p.uri, p.name, p.mime));
      const now = new Date();
      const { error: err } = await supabase.from('incidents').insert({
        shift_id: shiftId ?? null, client_id: clientId ?? null, caregiver_id: me.caregiverId,
        date: localDate(now, org.timezone), time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: org.timezone }).format(now),
        incident_type: type, severity, description: description.trim(), actions_taken: actions.trim() || null,
        involved_parties: involved.trim() || null, photo_urls: urls,
      });
      if (err) throw new Error(err.message);
      Alert.alert('Incident reported', 'The office has been notified.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        {clientName ? <Muted>About {clientName}</Muted> : null}
        <View><Label>What kind of incident?</Label><Chips values={TYPES} value={type} onChange={setType} /></View>
        <View><Label>How serious?</Label><Chips values={SEVERITIES} value={severity} onChange={setSeverity} /></View>
        <View><Label>What happened?</Label><Input value={description} onChangeText={setDescription} multiline placeholder="Facts only: what you saw and heard, and when." /></View>
        <View><Label>What did you do?</Label><Input value={actions} onChangeText={setActions} multiline placeholder="First aid, calls made, who you told." /></View>
        <View><Label>Anyone else involved or who saw it?</Label><Input value={involved} onChangeText={setInvolved} /></View>
        <View style={{ gap: 8 }}>
          <Label>Photos ({photos.length}/5)</Label>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {photos.map((p, i) => (
              <Pressable key={p.uri} onPress={() => setPhotos(photos.filter((_, j) => j !== i))}>
                <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} accessibilityLabel="Attached photo. Tap to remove." />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Take photo" kind="outline" onPress={() => addPhoto(true)} style={{ flex: 1 }} disabled={photos.length >= 5} />
            <Button title="Choose photo" kind="outline" onPress={() => addPhoto(false)} style={{ flex: 1 }} disabled={photos.length >= 5} />
          </View>
        </View>
        {error && <Banner text={error} />}
        <Button title="Submit report" onPress={submit} loading={busy} disabled={!type || description.trim().length < 5} />
      </ScrollView>
    </Screen>
  );
}
