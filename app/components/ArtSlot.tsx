import type { ReactNode } from "react";
import { Image } from "expo-image";
import { pixelArt, type ArtName } from "@/constants/art";

export function ArtSlot({ name, scale = 2, fallback = null }: {
  name: ArtName;
  scale?: number;
  fallback?: ReactNode;
}) {
  const asset = pixelArt[name];
  if (!asset) return <>{fallback}</>;
  const integerScale = Math.max(1, Math.round(scale));
  return (
    <Image
      source={asset.source}
      style={{ width: asset.width * integerScale, height: asset.height * integerScale }}
      contentFit="contain"
      transition={0}
      accessible={false}
    />
  );
}
