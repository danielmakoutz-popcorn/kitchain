import type { ImagePickerAsset } from "expo-image-picker";
import { File } from "expo-file-system";

/** SDK 57's fetch requires file bytes/Blobs, rather than React Native URI parts. */
export async function photoForm(asset: ImagePickerAsset): Promise<FormData> {
  const file = new File(asset.uri);
  const bytes = await file.bytes();
  const blob = new Blob([bytes], { type: asset.mimeType || file.type || "application/octet-stream" });
  const form = new FormData();
  form.append("file", blob, asset.fileName || file.name || "recipe.jpg");
  return form;
}
