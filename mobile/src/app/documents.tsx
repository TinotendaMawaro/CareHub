import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { DocRow } from '@/components/documents';
import { Banner, Button, Card, Empty, Input, Label, Screen, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { DOC_SELECT, type Doc, WORKER_DOC_CATEGORIES, isValidYmd, needsRenewal } from '@/lib/documents';
import { localDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { uploadLocalFile } from '@/lib/upload';

const fetchMine = (caregiverId: string) =>
  supabase.from('documents').select(DOC_SELECT).eq('caregiver_id', caregiverId).order('created_at', { ascending: false });

/** A support worker's own documents: see what's on file, spot expiries, upload renewals. */
export default function MyDocuments() {
  const { me, org } = useSession();
  const today = localDate(new Date(), org.timezone);
  const caregiverId = me?.caregiverId ?? '';
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState(WORKER_DOC_CATEGORIES[0]);
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback(({ data }: Awaited<ReturnType<typeof fetchMine>>) => {
    setDocs((data ?? []) as Doc[]);
    setLoaded(true);
  }, []);
  const load = useCallback(async () => apply(await fetchMine(caregiverId)), [caregiverId, apply]);
  useEffect(() => {
    if (!caregiverId) return;
    let alive = true;
    void fetchMine(caregiverId).then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [caregiverId, apply]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function choose() {
    if (expiry && !isValidYmd(expiry)) return Alert.alert('Check the expiry date', 'Use the format YYYY-MM-DD, or leave it empty if it never expires.');
    Alert.alert('Add a file', 'Take a photo of the document or choose a PDF.', [
      { text: 'Take photo', onPress: () => void fromPhoto(true) },
      { text: 'Photo library', onPress: () => void fromPhoto(false) },
      { text: 'PDF or file', onPress: () => void fromFile() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  async function fromPhoto(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow access in your phone settings.');
    const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: 'images', quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await upload(a.uri, a.fileName ?? 'document.jpg', a.mimeType ?? 'image/jpeg', a.fileSize ?? null);
  }
  async function fromFile() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await upload(a.uri, a.name, a.mimeType ?? 'application/pdf', a.size ?? null);
  }
  async function upload(uri: string, name: string, mime: string, size: number | null) {
    setBusy(true);
    try {
      const path = await uploadLocalFile('documents', uri, name, mime);
      const { error } = await supabase.from('documents').insert({
        title: category, category, caregiver_id: caregiverId, file_path: path, file_name: name,
        mime_type: mime, size_bytes: size, expiry_date: expiry || null,
      });
      if (error) throw new Error(error.message);
      setAdding(false);
      setExpiry('');
      Alert.alert('Sent to the office', 'They will check it and let you know if anything is wrong.');
      await load();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const attention = needsRenewal(docs, today);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {attention.length > 0 && (
          <Banner tone="warn" text={`${attention.length} of your documents ${attention.length === 1 ? 'needs' : 'need'} renewing. Upload the new copy below.`} />
        )}

        <Card>
          <Label>Your documents</Label>
          {loaded && docs.length === 0 && <Empty text="Nothing on file yet. Add your screening check, first aid certificate and licence below." />}
          {docs.map((d) => <DocRow key={d.id} doc={d} today={today} />)}
        </Card>

        {!adding ? (
          <Button title="Add or renew a document" onPress={() => setAdding(true)} />
        ) : (
          <Card style={{ gap: 10 }}>
            <Label>What is it?</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WORKER_DOC_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: category === c }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5,
                    borderColor: category === c ? org.brandColor : colors.border,
                    backgroundColor: category === c ? `${org.brandColor}1f` : 'rgba(255,255,255,0.6)',
                  }}
                >
                  <Text style={{ color: category === c ? org.brandColor : colors.text, fontWeight: '600', fontSize: 13 }}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Label>Expiry date (if it has one)</Label>
            <Input value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" accessibilityLabel="Expiry date" />
            <Button title="Choose file or take photo" onPress={choose} loading={busy} />
            <Button title="Cancel" kind="outline" onPress={() => { setAdding(false); setExpiry(''); }} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
