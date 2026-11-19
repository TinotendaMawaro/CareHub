import { Linking, Text, View } from 'react-native';
import { colors } from '@/components/ui';
import { parseMarkdown, type Inline } from '@/lib/mini-markdown';

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === 'text') return <Text key={i}>{n.v}</Text>;
        if (n.t === 'b') return <Text key={i} style={{ fontWeight: '700' }}><Inlines nodes={n.c} /></Text>;
        if (n.t === 'i') return <Text key={i} style={{ fontStyle: 'italic' }}><Inlines nodes={n.c} /></Text>;
        return (
          <Text key={i} accessibilityRole="link" onPress={() => void Linking.openURL(n.href)} style={{ color: '#2563eb', textDecorationLine: 'underline', fontWeight: '600' }}>
            <Inlines nodes={n.c} />
          </Text>
        );
      })}
    </>
  );
}

/** Shift instructions with the office's formatting: headings, lists, bold, italic and tappable links. */
export function RichText({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, i) => {
        if (b.t === 'h') return <Text key={i} style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}><Inlines nodes={b.c} /></Text>;
        if (b.t === 'p') return <Text key={i} style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}><Inlines nodes={b.c} /></Text>;
        return (
          <View key={i} style={{ gap: 4 }}>
            {b.items.map((it, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 15, minWidth: 18 }}>{b.t === 'ul' ? '•' : `${j + 1}.`}</Text>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 }}><Inlines nodes={it} /></Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
