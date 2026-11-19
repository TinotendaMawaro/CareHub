import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';
import { uploadLocalFile } from '@/lib/upload';

const SIZE = 96;

function initials(name: string | undefined) {
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** The signed-in worker's photo with a camera button to change it. Shows on the web roster too. */
export function ProfilePhoto({ name }: { name?: string }) {
  const { session, org } = useSession();
  const uid = session?.user.id;
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);

  const apply = useCallback((r: { data: { avatar_url: string | null } | null }) => setUrl(r.data?.avatar_url ?? null), []);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void supabase.from('profiles').select('avatar_url').eq('id', uid).maybeSingle().then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [uid, apply]);

  async function pick(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow access in your phone settings.');
    const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({
      mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (r.canceled || !r.assets?.[0] || !uid) return;
    const a = r.assets[0];
    setBusy(true);
    try {
      const path = await uploadLocalFile('avatars', a.uri, 'avatar.jpg', a.mimeType ?? 'image/jpeg');
      const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', uid);
      if (error) throw new Error(error.message);
      const old = url ? /\/avatars\/(.+)$/.exec(url)?.[1] : null;
      if (old) void supabase.storage.from('avatars').remove([old]);
      setBroken(false);
      setUrl(publicUrl);
    } catch (e) {
      Alert.alert('Could not update your photo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function choose() {
    Alert.alert('Profile photo', 'This photo is shown to the office and on your shifts.', [
      { text: 'Take photo', onPress: () => void pick(true) },
      { text: 'Choose from library', onPress: () => void pick(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Pressable onPress={choose} disabled={busy} accessibilityRole="button" accessibilityLabel="Change profile photo" style={{ alignSelf: 'center' }}>
      <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', backgroundColor: org.brandColor, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' }}>
        {url && !broken ? (
          <Image source={{ uri: url }} style={{ width: SIZE, height: SIZE }} onError={() => setBroken(true)} accessibilityIgnoresInvertColors accessibilityLabel="Your profile photo" />
        ) : (
          <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800' }}>{initials(name)}</Text>
        )}
        {busy && (
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
      <View style={{ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.text, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 15 }}>{'\u{1F4F7}'}</Text>
      </View>
    </Pressable>
  );
}
