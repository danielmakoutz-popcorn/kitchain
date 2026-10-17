import type { ImagePickerAsset } from "expo-image-picker";

/** Browser drafts may hold a data URL instead of the picker's original File. */
export async function photoForm(asset: ImagePickerAsset): Promise<FormData> {
  const file = asset.file || await (await fetch(asset.uri)).blob();
  const form = new FormData();
  form.append("file", file, asset.fileName || "recipe.jpg");
  return form;
}
