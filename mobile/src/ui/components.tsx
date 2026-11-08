/**
 * Shared building blocks. Every one takes its colours from useTheme(), so a
 * screen never hard-codes a colour and both themes stay consistent.
 */
import { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TextInputProps, View, ViewStyle,
} from 'react-native';
import { radius, space, Theme, type, useTheme } from './theme';

export function ScreenScroll({ children, onRefresh, refreshing = false }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  const t = useTheme();
  return <ScrollView
    style={{ flex: 1, backgroundColor: t.bg }}
    contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
    keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh
      ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />
      : undefined}
  >{children}</ScrollView>;
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTheme();
  return <View style={{ gap: space.xs }}>
    <Text style={[type.display, { color: t.text }]}>{title}</Text>
    {!!subtitle && <Text style={[type.body, { color: t.textMuted }]}>{subtitle}</Text>}
  </View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const t = useTheme();
  return <View style={styles.row}>
    <Text style={[type.heading, { color: t.text, flex: 1 }]}>{children}</Text>
    {action}
  </View>;
}

export function Card({ children, style, onPress, accessibilityLabel }: {
  children: ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg, padding: space.lg, gap: space.sm,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    style={({ pressed }) => [base, pressed && { backgroundColor: t.surfaceAlt }, style]}
  >{children}</Pressable>;
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

function toneColors(t: Theme, tone: Tone) {
  switch (tone) {
    case 'accent': return { bg: t.accentSoft, fg: t.accent };
    case 'success': return { bg: t.successSoft, fg: t.success };
    case 'warning': return { bg: t.warningSoft, fg: t.warning };
    case 'danger': return { bg: t.dangerSoft, fg: t.danger };
    default: return { bg: t.surfaceAlt, fg: t.textMuted };
  }
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, alignSelf: 'flex-start' }}>
    <Text style={[type.caption, { color: c.fg, fontWeight: '700' }]}>{label}</Text>
  </View>;
}

export function Button({ title, onPress, disabled, variant = 'primary', loading }: {
  title: string; onPress: () => void; disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean;
}) {
  const t = useTheme();
  const palette = variant === 'primary'
    ? { bg: t.accent, fg: t.accentText, border: t.accent }
    : variant === 'danger'
      ? { bg: 'transparent', fg: t.danger, border: t.danger }
      : { bg: 'transparent', fg: t.accent, border: t.border };
  const off = disabled || loading;
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: !!off, busy: !!loading }}
    disabled={off}
    onPress={onPress}
    style={({ pressed }) => [{
      backgroundColor: palette.bg, borderColor: palette.border, borderWidth: 1,
      borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg,
      alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm,
      opacity: off ? 0.5 : pressed ? 0.85 : 1, minHeight: 48,
    }]}
  >
    {loading && <ActivityIndicator size="small" color={palette.fg} />}
    <Text style={[type.label, { color: palette.fg, fontSize: 15 }]}>{title}</Text>
  </Pressable>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return <View style={{ gap: space.xs }}>
    <Text style={[type.label, { color: t.textMuted }]}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={t.textMuted}
      {...props}
      style={{
        borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, color: t.text,
        borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 14, fontSize: 16,
      }}
    />
  </View>;
}

export function KeyValue({ label, value }: { label: string; value?: string | null }) {
  const t = useTheme();
  return <View style={[styles.row, { paddingVertical: space.sm, gap: space.lg }]}>
    <Text style={[type.body, { color: t.textMuted, flex: 1 }]}>{label}</Text>
    <Text style={[type.body, { color: t.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }]}>
      {value && String(value).trim() ? value : '—'}
    </Text>
  </View>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  return <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
    <Text style={[type.heading, { color: t.text, textAlign: 'center' }]}>{title}</Text>
    <Text style={[type.body, { color: t.textMuted, textAlign: 'center' }]}>{body}</Text>
  </Card>;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const t = useTheme();
  return <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
    <ActivityIndicator accessibilityLabel={label} color={t.accent} />
    <Text style={[type.caption, { color: t.textMuted }]}>{label}…</Text>
  </View>;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.dangerSoft, borderRadius: radius.md, padding: space.lg, gap: space.sm }}>
    <Text accessibilityRole="alert" style={[type.body, { color: t.danger }]}>{message}</Text>
    {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
  </View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
