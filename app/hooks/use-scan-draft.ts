import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { draftStorage, releaseDraftPhoto } from "@/lib/draft-platform";
import { createScanDraftStore, emptyScanDraft, type ScanDraft } from "@/lib/scan-draft-core";

// One ordered store per server, shared across screen remounts.
const store = createScanDraftStore(draftStorage, API_BASE);

export function useScanDraft() {
  const [draft, setDraft] = useState(() => emptyScanDraft(API_BASE));
  const current = useRef(draft);
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [recoveryDisabled, setRecoveryDisabled] = useState(false);
  const persistenceEnabled = useRef(true);
  const active = useRef(false);
  const revision = useRef(0);
  const canWrite = useRef(false);

  const load = useCallback(async () => {
    try {
      const saved = await store.load();
      if (!active.current || !persistenceEnabled.current) return;
      current.current = saved || emptyScanDraft(API_BASE);
      setDraft(current.current);
      setRecovered(!!saved?.photo);
      setStorageError("");
      canWrite.current = true;
      setReady(true);
    } catch {
      if (active.current && persistenceEnabled.current) setStorageError("Your saved draft could not be opened. Retry, discard it, or continue without recovery.");
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; canWrite.current = false; };
  }, [load]);

  const update = useCallback(async (patch: Partial<ScanDraft>) => {
    if (!canWrite.current) return false;
    const previous = current.current;
    const next = { ...previous, ...patch, updatedAt: Date.now() };
    const change = ++revision.current;
    current.current = next;
    setDraft(next);
    setRecovered(false);
    if (!next.photo || !persistenceEnabled.current) return true;
    setSavingDraft(true);
    try {
      await store.save(next);
      if (active.current && revision.current === change) {
        setStorageError(""); setSavingDraft(false);
      }
      if (previous.photo?.uri !== next.photo.uri) await releaseDraftPhoto(previous.photo).catch(() => undefined);
      return true;
    } catch {
      if (active.current && revision.current === change) {
        setStorageError("This draft could not be saved on your device. Keep this screen open and retry saving the draft.");
        setSavingDraft(false);
      }
      return false;
    }
  }, []);

  const clear = useCallback(async (savedRecipeId?: number) => {
    // Persist a completion marker before cleanup: failed cleanup must not offer to create the recipe twice.
    const previous = current.current;
    canWrite.current = false;
    ++revision.current;
    try {
      let removed = true;
      if (persistenceEnabled.current) {
        if (savedRecipeId && previous.photo) removed = await store.finish(previous, savedRecipeId);
        else await store.clear();
      }
      current.current = emptyScanDraft(API_BASE);
      if (active.current) {
        setDraft(current.current); setRecovered(false); setReady(true);
        setStorageError(""); setSavingDraft(false);
      }
      if (removed) await releaseDraftPhoto(previous.photo).catch(() => undefined);
      return removed;
    } catch {
      if (savedRecipeId) {
        current.current = { ...previous, savedRecipeId };
        if (active.current) setDraft(current.current);
      }
      if (active.current) {
        setStorageError("The draft could not be cleared. Retry when device storage is available.");
        setSavingDraft(false);
      }
      return false;
    } finally { canWrite.current = active.current; }
  }, []);

  const continueWithoutRecovery = useCallback(() => {
    // Only offered before hydration succeeds: keep an unreadable stored draft intact.
    persistenceEnabled.current = false;
    canWrite.current = true;
    setRecoveryDisabled(true); setReady(true); setStorageError(""); setSavingDraft(false);
  }, []);

  return { draft, ready, recovered, storageError, savingDraft, recoveryDisabled, continueWithoutRecovery, update, clear, reload: load };
}
