import { useId, useState, type ReactNode } from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
import Svg, { Path, Rect, Defs, Pattern } from "react-native-svg";
import { kitchen as c } from "@/constants/kitchen";

export type KitchenIconName = "herb" | "scan" | "save" | "book" | "search" | "close" | "check" | "back" | "plus" | "edit" | "delete" | "sparkle";
const icons: Record<KitchenIconName, string> = {
  herb: "M7 15h2V9h2V7h2V3h-2v3H9v3H7zM2 3h3v1h2v3H4V6H2zM10 1h3v4h-1v1h-2zM1 8h3v1h3v3H4v-1H2V10H1zM11 7h4v3h-1v1h-4V9h1z",
  scan: "M1 1h5v2H3v3H1zM10 1h5v5h-2V3h-3zM1 10h2v3h3v2H1zM13 10h2v5h-5v-2h3zM4 7h8v2H4z",
  save: "M2 1h10v1h2v13H2zM4 3v4h6V3zM4 10v3h8v-3z",
  book: "M1 2h6l1 1 1-1h6v12H9l-1 1-1-1H1zM3 4v8h4V4zM9 4v8h4V4z",
  search: "M3 1h6v1h2v2h1v5h-2v2H8v1H3v-1H1V9H0V4h1V2h2zM3 3v1H2v4h1v2h5V9h2V4H8V3zM10 10h2v2h2v2h2v2h-3v-2h-2v-2h-1z",
  close: "M2 1h2v2h2v2h2V3h2V1h2v3h-2v2H8v2h2v2h2v3h-2v-2H8V9H6v2H4v2H2v-3h2V8h2V6H4V4H2z",
  check: "M1 8h3v2h2V8h2V6h2V4h2V2h3v4h-2v2h-2v2H9v2H7v2H4v-2H2v-2H1z",
  back: "M7 1h3v3H8v2H6v3h2v2h2v3H7v-2H5v-2H3V5h2V3h2z",
  plus: "M6 1h3v5h5v3H9v5H6V9H1V6h5z",
  edit: "M10 1h3v1h1v3h-1v1h-1L8 10H7v1H6v1H2V8h1V7h1V6h1l4-4h1zM3 10h2V8H3z",
  delete: "M5 1h5v2h4v2H1V3h4zM3 6h9v9H3zM5 7v6h1V7zM9 7v6h1V7z",
  sparkle: "M7 0h2v5h2v2h5v2h-5v2H9v5H7v-5H5V9H0V7h5V5h2z",
};
export function PixelIcon({ name, size = 24, color = c.espresso }: { name: KitchenIconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 16 16" accessible={false}><Path d={icons[name]} fill={color} fillRule="evenodd" /></Svg>;
}

/** A scalable frame: corners stay at eight layout pixels, even on long cards. */
export function PixelFrame({ children, fill = c.paper, ornate = false, shadow = true, contentStyle, ...props }: ViewProps & {
  fill?: string; ornate?: boolean; shadow?: boolean; contentStyle?: ViewProps["style"];
}) {
  const grainId = useId().replace(/:/g, "");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width: w, height } = size;
  const h = height - (shadow ? 4 : 0);
  const outline = w && h ? `M9 2H${w-9}V5H${w-5}V9H${w-2}V${h-9}H${w-5}V${h-5}H${w-9}V${h-2}H9V${h-5}H5V${h-9}H2V9H5V5H9Z` : "";
  return <View {...props} style={[{ paddingBottom: shadow ? 4 : 0 }, props.style]} onLayout={e => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev => prev.width === Math.round(width) && prev.height === Math.round(height) ? prev : { width: Math.round(width), height: Math.round(height) });
    props.onLayout?.(e);
  }}>
    {!!w && !!h && <Svg pointerEvents="none" accessible={false} width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs><Pattern id={grainId} x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse"><Rect x="4" y="6" width="1" height="1" fill={c.espresso} opacity={0.055} /><Rect x="17" y="15" width="2" height="1" fill={c.espresso} opacity={0.035} /></Pattern></Defs>
      {shadow && <Path d={outline} fill={c.border} opacity={0.6} transform="translate(0 3)" />}
      <Path d={outline} fill={fill} stroke={c.espresso} strokeWidth={2} />
      <Path d={`M10 7H${w-10}M7 10V${h-11}`} fill="none" stroke={c.highlight} strokeWidth={2} opacity={0.7} />
      {ornate && <><Path d={outline} fill={`url(#${grainId})`} /><Path d={`M13 23V13H23V18H18V13M${w-23} 13H${w-13}V23H${w-18}V18H${w-13}M13 ${h-23}V${h-13}H23V${h-18}H18V${h-13}M${w-23} ${h-13}H${w-13}V${h-23}H${w-18}V${h-18}H${w-13}`} stroke={c.border} strokeWidth={2} fill="none" /></>}
    </Svg>}
    <View style={[{ padding: ornate ? 24 : 14 }, contentStyle]}>{children}</View>
  </View>;
}

export function Flourish() {
  return <View accessible={false} style={{ flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "center", paddingVertical: 8 }}>
    <View style={{ height: 1, backgroundColor: c.border, width: 44 }} /><PixelIcon name="sparkle" size={12} color={c.border} /><View style={{ height: 1, backgroundColor: c.border, width: 44 }} />
  </View>;
}

export function ScannerFrame({ children, reading = false }: { children: ReactNode; reading?: boolean }) {
  return <View style={{ padding: 12, backgroundColor: c.paper, minHeight: 180 }}>
    {children}
    {([['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']] as const).map(([x, y]) => <View key={`${x}-${y}`} pointerEvents="none" style={{ position: "absolute", [x]: 2, [y]: 2, width: 26, height: 26, [`border${x === 'left' ? 'Left' : 'Right'}Width`]: 4, [`border${y === 'top' ? 'Top' : 'Bottom'}Width`]: 4, borderColor: c.greenShade }} />)}
    {reading && <View pointerEvents="none" style={{ position: "absolute", left: 10, right: 10, top: "50%", height: 2, backgroundColor: c.terracotta }} />}
  </View>;
}
