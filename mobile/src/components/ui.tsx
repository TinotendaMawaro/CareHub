import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { useSession } from '@/hooks/use-session';

export const colors = {
  text: '#0b1220', muted: '#5b6b82', border: 'rgba(255,255,255,0.7)', bg: '#f4f7fb', card: '#ffffff',
  danger: '#dc2626', ok: '#059669', warn: '#d97706',
};

/** Space to leave at the bottom of tab screens so content clears the floating glass tab bar. */
export const TAB_BAR_SPACE = 110;

/** Black or white, whichever reads better on the given #rrggbb colour. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return '#ffffff';
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

/** Scales a #rrggbb colour towards black (f < 1) for gradient ends. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

function tap() {
  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Soft brand-tinted gradient with diffused colour orbs, so the glass cards have something to refract. */
export function Backdrop() {
  const { org } = useSession();
  const b = org.brandColor;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[`${b}33`, '#f4f7fb', '#eef3fa']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', top: -80, right: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: b, opacity: 0.28 }} />
      <View style={{ position: 'absolute', top: 260, left: -110, width: 280, height: 280, borderRadius: 140, backgroundColor: shade(b, 0.7), opacity: 0.16 }} />
      <View style={{ position: 'absolute', bottom: 40, right: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: b, opacity: 0.14 }} />
      <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <Backdrop />
      {children}
    </View>
  );
}

/** Frosted-glass surface. The blur sits behind a light tint; a bright hairline and soft shadow lift it off the backdrop. */
export function Glass({
  children, style, radius = 20, intensity = 50, innerStyle,
}: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; intensity?: number; innerStyle?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.shadow, { borderRadius: radius }, style]}>
      <View style={[s.clip, { borderRadius: radius }]}>
        <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.55)' }]} />
        <View style={[{ padding: 16, gap: 6 }, innerStyle]}>{children}</View>
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Glass style={style}>{children}</Glass>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[{ color: colors.muted, fontSize: 13 }, style]}>{children}</Text>;
}

export function Button({
  title, onPress, kind = 'primary', loading, disabled, style,
}: { title: string; onPress: () => void; kind?: 'primary' | 'outline' | 'danger'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { org } = useSession();
  const off = disabled || loading;
  const base = kind === 'danger' ? colors.danger : org.brandColor;
  const fg = kind === 'outline' ? org.brandColor : kind === 'danger' ? '#fff' : readableOn(org.brandColor);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={off}
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [
        s.btnShadow,
        kind !== 'outline' && { shadowColor: base },
        { opacity: off ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {kind === 'outline' ? (
        <View style={[s.btn, { borderWidth: 1.5, borderColor: `${base}99`, backgroundColor: 'rgba(255,255,255,0.5)' }]}>
          {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
        </View>
      ) : (
        <LinearGradient colors={[base, shade(base, 0.78)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
          {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const [focus, setFocus] = React.useState(false);
  const { org } = useSession();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
      style={[s.input, focus && { borderColor: org.brandColor, backgroundColor: 'rgba(255,255,255,0.95)' }, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, props.style]}
    />
  );
}

export function Pill({ text, tone = 'muted' }: { text: string; tone?: 'ok' | 'warn' | 'danger' | 'muted' | 'brand' }) {
  const { org } = useSession();
  const c = tone === 'brand' ? org.brandColor : tone === 'muted' ? colors.muted : colors[tone];
  return (
    <View style={{ backgroundColor: `${c}22`, borderColor: `${c}33`, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: c, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={{ color: colors.muted, textAlign: 'center', padding: 32 }}>{text}</Text>;
}

export function Banner({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'warn' | 'ok' }) {
  const c = colors[tone];
  return (
    <View style={{ backgroundColor: `${c}1a`, borderColor: `${c}40`, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: c, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  shadow: { shadowColor: '#0b1220', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  clip: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)' },
  h1: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  btnShadow: { borderRadius: 14, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.1 },
  input: { borderWidth: 1, borderColor: 'rgba(15,23,42,0.1)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: 'rgba(255,255,255,0.7)' },
});
