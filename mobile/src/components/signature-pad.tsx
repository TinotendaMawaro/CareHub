import { useRef, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/components/ui';

export type Signature = { strokes: string; width: number; height: number };

/**
 * Finger signature. Strokes are kept as SVG path data with whole-pixel moves and lines,
 * which is exactly what the server accepts and what the dashboard draws back.
 */
export function SignaturePad({ onChange, height = 220 }: { onChange: (s: Signature | null) => void; height?: number }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [live, setLive] = useState('');
  const stroke = useRef('');
  const size = useRef({ width: 300, height });

  const pt = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    return `${Math.round(Math.max(0, Math.min(size.current.width, x)))} ${Math.round(Math.max(0, Math.min(size.current.height, y)))}`;
  };
  const begin = (e: GestureResponderEvent) => {
    stroke.current = `M${pt(e)}`;
    setLive(stroke.current);
  };
  const move = (e: GestureResponderEvent) => {
    if (!stroke.current) return;
    stroke.current += ` L${pt(e)}`;
    setLive(stroke.current);
  };
  const end = () => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = '';
    // a tap becomes a dot
    const next = [...paths, s.includes('L') ? s : `${s} L${s.slice(1)}`];
    setPaths(next);
    setLive('');
    onChange({ strokes: next.join(' '), width: Math.round(size.current.width), height: Math.round(size.current.height) });
  };
  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { width: Math.max(50, e.nativeEvent.layout.width), height: Math.max(50, e.nativeEvent.layout.height) };
  };
  const clear = () => {
    stroke.current = '';
    setPaths([]);
    setLive('');
    onChange(null);
  };

  return (
    <View style={{ gap: 6 }}>
      <View
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={begin}
        onResponderMove={move}
        onResponderRelease={end}
        onResponderTerminate={end}
        accessibilityLabel="Signature area. Sign with your finger."
        style={{ height, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.muted, backgroundColor: '#fff', overflow: 'hidden' }}
      >
        <Svg width="100%" height="100%" pointerEvents="none">
          {[...paths, live].filter(Boolean).map((d, i) => (
            <Path key={i} d={d} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {paths.length === 0 && !live && (
          <Text pointerEvents="none" style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', color: colors.muted }}>Sign here</Text>
        )}
      </View>
      <Pressable onPress={clear} accessibilityRole="button" style={{ alignSelf: 'flex-end', padding: 6 }}>
        <Text style={{ color: colors.muted, fontWeight: '600' }}>Clear</Text>
      </Pressable>
    </View>
  );
}
