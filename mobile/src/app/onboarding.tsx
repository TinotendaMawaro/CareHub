import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, Input, Label, Muted, Pill, Screen, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { parseError, rpc, supabase } from '@/lib/supabase';
import { uploadLocalFile } from '@/lib/upload';

type Task = { id: string; step_key: string; title: string; description: string | null; kind: 'accept_document' | 'form' | 'upload' | 'info'; required: boolean; status: 'todo' | 'submitted' | 'approved' | 'rejected'; review_note: string | null; data: Record<string, string> };

const TONE = { todo: 'muted', submitted: 'warn', approved: 'ok', rejected: 'danger' } as const;
const LABEL = { todo: 'To do', submitted: 'With the office', approved: 'Done', rejected: 'Needs fixing' } as const;

export default function Onboarding() {
  const { session, refreshOnboarding } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('onboarding_tasks').select('id,step_key,title,description,kind,required,status,review_note,data').eq('profile_id', session.user.id).order('created_at');
    setTasks((data ?? []) as Task[]);
    await refreshOnboarding();
  }, [session, refreshOnboarding]);
  useEffect(() => { void load(); }, [load]);

  async function submit(t: Task, data: Record<string, unknown>, file: string | null) {
    try {
      await rpc('submit_onboarding_task', { p_task: t.id, p_data: data, p_file_url: file });
      await load();
    } catch (e) {
      Alert.alert('Could not submit', parseError(e).message);
    }
  }

  async function pickAndUpload(t: Task) {
    Alert.alert('Add a file', 'Take a photo or choose a file (PDF or image).', [
      { text: 'Take photo', onPress: () => void doPhoto(t, true) },
      { text: 'Photo library', onPress: () => void doPhoto(t, false) },
      { text: 'PDF or file', onPress: () => void doDoc(t) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  async function doPhoto(t: Task, camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow access in your phone settings.');
    const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: 'images', quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await upload(t, a.uri, a.fileName ?? `${t.step_key}.jpg`, a.mimeType ?? 'image/jpeg');
  }
  async function doDoc(t: Task) {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await upload(t, a.uri, a.name, a.mimeType ?? 'application/pdf');
  }
  async function upload(t: Task, uri: string, name: string, mime: string) {
    setBusy(t.id);
    try {
      const path = await uploadLocalFile('onboarding', uri, name, mime);
      await submit(t, {}, path);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const required = tasks.filter((t) => t.required);
  const done = required.filter((t) => t.status === 'approved').length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {tasks.length === 0 ? (
          <Muted>The office has not set up your onboarding checklist yet.</Muted>
        ) : (
          <Banner tone={done === required.length ? 'ok' : 'warn'} text={done === required.length ? 'All required steps are complete.' : `${done} of ${required.length} required steps done.`} />
        )}
        {tasks.map((t) => (
          <Card key={t.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text }}>{t.title}{t.required ? '' : ' (optional)'}</Text>
              <Pill text={LABEL[t.status]} tone={TONE[t.status]} />
            </View>
            {t.description && <Muted>{t.description}</Muted>}
            {t.status === 'rejected' && t.review_note && <Text style={{ color: colors.danger }}>Office: {t.review_note}</Text>}
            {(t.status === 'todo' || t.status === 'rejected') && t.kind === 'upload' && (
              <Button title="Add file" kind="outline" onPress={() => pickAndUpload(t)} loading={busy === t.id} />
            )}
            {(t.status === 'todo' || t.status === 'rejected') && t.kind === 'form' && (
              <View style={{ gap: 8 }}>
                <Label>Details</Label>
                <Input multiline value={drafts[t.id] ?? ''} onChangeText={(v) => setDrafts({ ...drafts, [t.id]: v })} placeholder="Name, relationship and phone number" />
                <Button title="Submit" onPress={() => submit(t, { text: drafts[t.id] }, null)} disabled={!(drafts[t.id] ?? '').trim()} />
              </View>
            )}
            {t.kind === 'info' && t.status === 'todo' && <Muted>The office will mark this done after your induction.</Muted>}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
