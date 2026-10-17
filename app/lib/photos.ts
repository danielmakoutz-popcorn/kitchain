import type { ImagePickerAsset } from "expo-image-picker";
import { File } from "expo-file-system";

/** Let Expo fetch read the native file; React Native cannot build Blobs from bytes. */
export async function photoForm(asset: ImagePickerAsset): Promise<FormData> {
  const form = new FormData();
  form.append("file", new File(asset.uri));
  return form;
}
