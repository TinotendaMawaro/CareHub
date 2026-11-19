import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, Input, Label, Muted, Screen, colors } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { parseError, rpc, supabase } from '@/lib/supabase';

type Doc = { id: string; kind: string; title: string; version: number; body: string };

/** Inline **bold** as nested Text runs. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>
          : <Text key={i}>{p.replace(/\*(.*?)\*/g, '$1')}</Text>,
      )}
    </>
  );
}

/** The organisation's policies: headings, paragraphs, bullet and numbered lists, bold. */
function Body({ text, org }: { text: string; org: string }) {
  const lines = text.replace(/\{\{organisation\}\}/g, org).split('\n');
  return (
    <View style={{ gap: 8 }}>
      {lines.map((line, i) => {
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        const li = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(line);
        if (!line.trim()) return null;
        if (h) {
          const level = h[1].length;
          return <Text key={i} style={{ color: colors.text, fontSize: level === 1 ? 20 : 16, fontWeight: '800', marginTop: level === 1 ? 0 : 6 }}>{h[2]}</Text>;
        }
        if (li) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22, minWidth: 16 }}>{li[1] ? `${li[1]}.` : '•'}</Text>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 }}><Inline text={li[2]} /></Text>
            </View>
          );
        }
        return <Text key={i} style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}><Inline text={line} /></Text>;
      })}
    </View>
  );
}

const fetchPending = () => supabase.rpc('pending_legal_documents');

export default function Terms() {
  const { refreshOnboarding, signOut, me, org } = useSession();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(({ data, error: err }: Awaited<ReturnType<typeof fetchPending>>) => {
    if (err) setError(err.message);
    setDocs((data ?? []) as Doc[]);
  }, []);
  const load = useCallback(async () => apply(await fetchPending()), [apply]);
  useEffect(() => {
    let alive = true;
    void fetchPending().then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [apply]);

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
              <Body text={doc.body} org={org.name} />
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
