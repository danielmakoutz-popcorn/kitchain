import type { ImageSource } from "expo-image";

export type ArtName = "scanButton" | "scanWorking" | "scanReady" | "scanError" | "recipePlaceholder";
type PixelAsset = { source: ImageSource | number; width: number; height: number };

/** Replace nulls with literal require(...) sources when Daniel's final art is ready. */
export const pixelArt: Record<ArtName, PixelAsset | null> = {
  scanButton: null,
  scanWorking: null,
  scanReady: null,
  scanError: null,
  recipePlaceholder: null,
};
