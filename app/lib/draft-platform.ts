import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { ImagePickerAsset } from "expo-image-picker";
import type { DraftPhoto, DraftStorage } from "./scan-draft-core";

export const draftStorage: DraftStorage = AsyncStorage;
const photoDirectory = () => new Directory(Paths.document, "kitchain-scan-drafts");

export async function keepDraftPhoto(asset: ImagePickerAsset): Promise<DraftPhoto> {
  const directory = photoDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const extension = asset.fileName?.match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[0] || ".jpg";
  const destination = new File(directory, `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
  new File(asset.uri).copy(destination);
  return { uri: destination.uri, width: asset.width, height: asset.height, fileName: asset.fileName, mimeType: asset.mimeType };
}

export async function releaseDraftPhoto(photo: DraftPhoto | null) {
  if (!photo || !photo.uri.startsWith(`${photoDirectory().uri.replace(/\/$/, "")}/`)) return;
  const file = new File(photo.uri);
  if (file.exists) file.delete();
}
