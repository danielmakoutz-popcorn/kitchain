import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo } from "react-native";
import { Image } from "expo-image";
import { pixelArt, type ArtName } from "@/constants/art";

/** Static PNGs today; optional frame sequences are ready for Daniel's animations. */
export function ArtSlot({ name, scale = 2, fallback = null }: { name: ArtName; scale?: number; fallback?: ReactNode }) {
  const asset = pixelArt[name];
  const [frame, setFrame] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const count = asset?.frames?.length || 0;
  useEffect(() => {
    if (!asset || reduceMotion || count < 2) return;
    const timer = setInterval(() => setFrame(index => (index + 1) % count), Math.max(40, asset.frameDurationMs || 120));
    return () => clearInterval(timer);
  }, [asset, count, reduceMotion]);
  if (!asset) return <>{fallback}</>;
  const integerScale = Math.max(1, Math.round(scale));
  return <Image source={!reduceMotion && count ? asset.frames![frame % count] : asset.source}
    style={{ width: asset.width * integerScale, height: asset.height * integerScale }} contentFit="contain" transition={0} accessible={false} />;
}
