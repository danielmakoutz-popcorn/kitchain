import type { ImagePickerAsset } from "expo-image-picker";
import type { DraftPhoto, DraftStorage } from "./scan-draft-core";

// IndexedDB keeps browser photo drafts out of localStorage's small string quota.
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("kitchain-local-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Draft storage is busy in another tab"));
  }).catch((error) => { database = undefined; throw error; });
  return database;
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("drafts", mode);
    const request = operation(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Draft save interrupted"));
  });
}

export const draftStorage: DraftStorage = {
  getItem: async (key) => (await transaction("readonly", (store) => store.get(key))) ?? null,
  setItem: (key, value) => transaction("readwrite", (store) => store.put(value, key)),
  removeItem: (key) => transaction("readwrite", (store) => store.delete(key)),
};

export async function keepDraftPhoto(asset: ImagePickerAsset): Promise<DraftPhoto> {
  const blob = asset.file || await (await fetch(asset.uri)).blob();
  const uri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { uri, width: asset.width, height: asset.height, fileName: asset.fileName, mimeType: asset.mimeType };
}

export async function releaseDraftPhoto(_photo: DraftPhoto | null) {
  // The image is part of the IndexedDB record and is removed with that record.
}
