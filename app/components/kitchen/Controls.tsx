import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text as NativeText, TextInput, View, type ScrollViewProps, type TextInputProps, type TextProps, type ViewProps } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { kitchen as c, kitchenFonts } from "@/constants/kitchen";
import { ArtSlot } from "@/components/ArtSlot";
import { PixelFrame, PixelIcon, type KitchenIconName } from "./PixelArt";

export function KitchenText({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ color: c.espresso, fontSize: 16, lineHeight: 24 }, style]} />;
}
export function KitchenHeading({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return <View style={{ gap: 6, marginBottom: 8 }}><KitchenText accessibilityRole="header" style={{ fontSize: 28, lineHeight: 36, fontFamily: kitchenFonts.heading, fontWeight: "700" }}>{children}</KitchenText>{subtitle && <KitchenText style={{ color: c.muted }}>{subtitle}</KitchenText>}</View>;
}
export function KitchenScreen({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ flex: 1, backgroundColor: c.ivory, paddingHorizontal: 18 }, style]} />;
}
export function KitchenScroll({ contentContainerStyle, style, ...props }: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" {...props} style={[{ flex: 1, backgroundColor: c.ivory }, style]} contentContainerStyle={[{ padding: 18, paddingBottom: 48, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" }, contentContainerStyle]} />;
}

type ButtonProps = ComponentPropsWithoutRef<typeof HapticPressable> & {
  variant?: "primary" | "butter" | "neutral" | "danger";
  icon?: KitchenIconName; compact?: boolean; children: ReactNode;
};
export const KitchenButton = forwardRef<View, ButtonProps>(function KitchenButton({ children, variant = "neutral", icon, compact = false, style, ...props }, ref) {
  const fill = { primary: c.herb, butter: c.butter, neutral: c.ivory, danger: c.errorPaper }[variant];
  return <HapticPressable {...props} ref={ref} style={state => [
    { minHeight: 48, flexShrink: 1, justifyContent: "center" },
    typeof style === "function" ? style(state) : style,
    state.pressed && { transform: [{ translateY: 2 }] },
  ]}>
    <PixelFrame fill={fill} contentStyle={{ paddingVertical: compact ? 10 : 14, paddingHorizontal: compact ? 14 : 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
      {icon && <PixelIcon name={icon} size={compact ? 18 : 22} color={variant === "danger" ? c.redInk : c.espresso} />}
      {typeof children === "string" || typeof children === "number" ? <KitchenText style={{ fontWeight: "700", textAlign: "center", flexShrink: 1, color: variant === "danger" ? c.redInk : c.espresso }}>{children}</KitchenText> : children}
    </PixelFrame>
  </HapticPressable>;
});

export const KitchenInput = forwardRef<TextInput, TextInputProps & { label?: string; containerStyle?: ViewProps["style"] }>(function KitchenInput({ label, style, containerStyle, multiline, editable, ...props }, ref) {
  return <View style={[{ gap: 6 }, containerStyle]}>
    {label && <KitchenText style={{ fontWeight: "700" }}>{label}</KitchenText>}
    <PixelFrame fill={c.ivory} shadow={false} contentStyle={{ padding: 4 }} style={editable === false ? { opacity: 0.65 } : undefined}>
      <TextInput ref={ref} placeholderTextColor={c.muted} accessibilityLabel={label} {...props} editable={editable} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[{ color: c.espresso, fontSize: 16, lineHeight: 24, minHeight: multiline ? 116 : 44, paddingHorizontal: 12, paddingVertical: 10 }, style]} />
    </PixelFrame>
  </View>;
});

export function KitchenSearch({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return <PixelFrame fill={c.ivory} contentStyle={{ padding: 4, flexDirection: "row", alignItems: "center", gap: 10 }}>
    <View style={{ marginLeft: 12 }}><PixelIcon name="search" size={22} /></View>
    <TextInput value={value} onChangeText={onChangeText} accessibilityLabel="Search recipes" placeholder="Search recipes or ingredients" placeholderTextColor={c.muted} returnKeyType="search" autoCorrect={false} style={{ flex: 1, minWidth: 0, color: c.espresso, paddingVertical: 12, fontSize: 16 }} />
    {!!value && <HapticPressable accessibilityLabel="Clear search" haptic="selection" onPress={() => onChangeText("")} hitSlop={4} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><PixelIcon name="close" size={18} /></HapticPressable>}
  </PixelFrame>;
}

export function KitchenNotice({ children, title, kind = "info" }: { children: ReactNode; title?: string; kind?: "info" | "error" | "success" }) {
  return <PixelFrame fill={kind === "error" ? c.errorPaper : c.paper} contentStyle={{ padding: 16, gap: 8 }} accessibilityLiveRegion="polite">
    {title && <KitchenText style={{ fontWeight: "700", color: kind === "error" ? c.redInk : c.espresso }}>{title}</KitchenText>}
    {typeof children === "string" ? <KitchenText>{children}</KitchenText> : children}
  </PixelFrame>;
}
export function ReadingRecipe() {
  return <View style={{ gap: 10, alignItems: "center", paddingVertical: 8 }}>
    <ArtSlot name="scanWorking" fallback={<View style={{ width: 96, height: 64, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={c.greenInk} size="large" accessibilityLabel="Reading recipe" /></View>} />
    <KitchenText style={{ fontWeight: "700" }}>Reading recipe…</KitchenText>
  </View>;
}
export const kitchenStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  label: { fontWeight: "700", marginTop: 8 },
  page: { gap: 16 },
});
