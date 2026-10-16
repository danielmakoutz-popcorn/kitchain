import type { ImagePickerAsset } from "expo-image-picker";
import { Platform } from "react-native";

/** Preserve the picker's real file type; use a Blob for browser previews. */
export async function photoForm(asset: ImagePickerAsset): Promise<FormData> {
  const form = new FormData();
  const name = asset.fileName || "recipe.jpg";
  if (Platform.OS === "web") {
    const file = asset.file || await (await fetch(asset.uri)).blob();
    form.append("file", file, name);
  } else {
    form.append("file", { uri: asset.uri, name, type: asset.mimeType || "image/jpeg" } as unknown as Blob);
  }
  return form;
}
