import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Muted, Pill, colors } from '@/components/ui';
import { type Doc, expiryLabel, expiryState } from '@/lib/documents';
import { supabase } from '@/lib/supabase';

/** Opens a document through a short-lived signed link (the bucket is private). */
export async function openDocument(doc: Pick<Doc, 'file_path'>) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 300);
  if (error || !data) return Alert.alert('Could not open the file', error?.message ?? 'Try again.');
  await Linking.openURL(data.signedUrl);
}

export function DocRow({ doc, today, showStatus = true }: { doc: Doc; today: string; showStatus?: boolean }) {
  const s = expiryState(doc.expiry_date, today);
  return (
    <Pressable
      onPress={() => void openDocument(doc)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${doc.title}`}
      style={({ pressed }) => ({ paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border, opacity: pressed ? 0.6 : 1, gap: 4 })}
    >
      <Text style={{ color: colors.text, fontWeight: '700' }}>{doc.title}</Text>
      <Muted>{doc.category}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill text={expiryLabel(doc.expiry_date, today)} tone={s === 'expired' ? 'danger' : s === 'expiring' ? 'warn' : 'muted'} />
        {showStatus && doc.status === 'pending_review' && <Pill text="Waiting for office review" tone="brand" />}
        {showStatus && doc.status === 'rejected' && <Pill text="Not accepted" tone="danger" />}
      </View>
      {showStatus && doc.status === 'rejected' && doc.review_note && <Muted>Office note: {doc.review_note}</Muted>}
    </Pressable>
  );
}
