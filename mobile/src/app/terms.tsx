import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, Input, Label, Muted, Screen, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { parseError, rpc, supabase } from '@/lib/supabase';

type Doc = { id: string; kind: string; title: string; version: number; body: string };

/** Minimal Markdown: headings, bold, bullets. The text is the organisation's own terms. */
function Body({ text }: { text: string }) {
  return (
    <View style={{ gap: 6 }}>
      {text.split('\n').map((line, i) => {
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        const clean = (h ? h[2] : line).replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
        if (!clean.trim()) return <View key={i} style={{ height: 4 }} />;
        return (
          <Text key={i} style={{ color: colors.text, fontSize: h ? 18 : 15, fontWeight: h ? '700' : '400', lineHeight: 22 }}>
            {clean}
          </Text>
        );
      })}
    </View>
  );
}

export default function Terms() {
  const { refreshOnboarding, signOut, me } = useSession();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('pending_legal_documents');
    if (err) setError(err.message);
    setDocs((data ?? []) as Doc[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function accept(doc: Doc) {
    setError(null);
    setBusy(true);
    try {
      await rpc('accept_document', { p_doc: doc.id, p_typed_name: name.trim() });
      await load();
      await refreshOnboarding(); // when nothing is left the gate lets us through
    } catch (e) {
      setError(parseError(e).message);
    } finally {
      setBusy(false);
    }
  }

  const doc = docs[0];
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {!doc ? (
          <Muted>Loading...</Muted>
        ) : (
          <>
            <Muted>Document 1 of {docs.length}. Please read it, then type your full name to accept.</Muted>
            <Card>
              <Body text={doc.body} />
            </Card>
            <View>
              <Label>Your full name{me ? ` (${me.name})` : ''}</Label>
              <Input value={name} onChangeText={setName} autoCapitalize="words" placeholder="Type your full name to accept" />
            </View>
            {error && <Banner text={error} />}
            <Button title={`I accept: ${doc.title}`} onPress={() => accept(doc)} loading={busy} disabled={name.trim().length < 2} />
          </>
        )}
        <Button title="Sign out" kind="outline" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}
