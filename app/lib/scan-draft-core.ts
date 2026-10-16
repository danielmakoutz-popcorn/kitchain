import { z } from "zod";
import { ScanResponseSchema } from "./types";

export const ScanDraftSchema = z.object({
  version: z.literal(1),
  apiBase: z.string(),
  updatedAt: z.number(),
  photo: z.object({
    uri: z.string(), width: z.number(), height: z.number(),
    fileName: z.string().nullish(), mimeType: z.string().optional(),
  }).nullable(),
  result: ScanResponseSchema.nullable(),
  title: z.string(), ingredientsText: z.string(), stepsText: z.string(), notesText: z.string(),
  selectedProfileId: z.number().nullable(), newProfileName: z.string(),
  savedRecipeId: z.number().int().positive().nullable().default(null),
});

export type ScanDraft = z.infer<typeof ScanDraftSchema>;
export type DraftPhoto = NonNullable<ScanDraft["photo"]>;
export type DraftStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

export function emptyScanDraft(apiBase: string): ScanDraft {
  return {
    version: 1, apiBase, updatedAt: Date.now(), photo: null, result: null,
    title: "", ingredientsText: "", stepsText: "", notesText: "",
    selectedProfileId: null, newProfileName: "", savedRecipeId: null,
  };
}

/** Serialize reads, writes and removal so an older autosave cannot revive a discarded draft. */
export function createScanDraftStore(storage: DraftStorage, apiBase: string) {
  const key = `kitchain:scan-draft:v1:${encodeURIComponent(apiBase)}`;
  let pending: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }
  return {
    load: () => enqueue(async () => {
      const raw = await storage.getItem(key);
      if (raw === null) return null;
      const draft = ScanDraftSchema.parse(JSON.parse(raw));
      if (draft.apiBase !== apiBase) throw new Error("Draft belongs to another server");
      return draft;
    }),
    save: (draft: ScanDraft) => {
      // Capture a snapshot before entering the asynchronous queue.
      const serialized = JSON.stringify(ScanDraftSchema.parse(draft));
      return enqueue(() => storage.setItem(key, serialized));
    },
    clear: () => enqueue(() => storage.removeItem(key)),
    finish: (draft: ScanDraft, recipeId: number) => {
      const expected = JSON.stringify(ScanDraftSchema.parse(draft));
      return enqueue(async () => {
        const raw = await storage.getItem(key);
        if (raw === null) return true;
        const saved = ScanDraftSchema.parse(JSON.parse(raw));
        // Preserve any newer photo, rescan, or edits made by a remounted screen.
        if (JSON.stringify(saved) !== expected) return false;
        await storage.setItem(key, JSON.stringify({ ...saved, savedRecipeId: recipeId }));
        await storage.removeItem(key);
        return true;
      });
    },
  };
}
