import type { ImageSource } from "expo-image";

export type ArtName = "scanButton" | "scanWorking" | "scanReady" | "scanError" | "recipePlaceholder" | "homeHero" | "collectionEmpty" | "saveSuccess";
export type PixelAsset = {
  source: ImageSource | number;
  width: number;
  height: number;
  /** Optional same-canvas PNG sequence; source is the reduced-motion poster. */
  frames?: readonly (ImageSource | number)[];
  frameDurationMs?: number;
};

/** Replace nulls with literal require(...) sources when Daniel's final art is ready. */
export const pixelArt: Record<ArtName, PixelAsset | null> = {
  scanButton: null,
  scanWorking: null,
  scanReady: null,
  scanError: null,
  recipePlaceholder: null,
  homeHero: null,
  collectionEmpty: null,
  saveSuccess: null,
};
