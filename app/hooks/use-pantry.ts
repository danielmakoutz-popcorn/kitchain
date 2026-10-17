import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { API_BASE, ensureCook, pantryApi } from "@/lib/api";
import { ingredientList, validatePantry } from "@/lib/pantry";

/** The server owns saved items; only the current cook's draft is cached on this device. */
export function usePantry() {
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const cacheKey = useRef("");
  const textRef = useRef("");
  const dirtyRef = useRef(false);
  const sequence = useRef(0);
  const saveLock = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async (discardDraft = false) => {
    const ticket = ++sequence.current;
    setError(""); setReady(false);
    try {
      const cook = await ensureCook();
      const key = `kitchain-pantry-draft:${API_BASE}:${cook.id}`;
      let pantry = await pantryApi.get();
      if (ticket !== sequence.current) return;
      cacheKey.current = key;
      // Adopt the pre-pantry search list once, only for a cook with no saved pantry.
      const legacyKey = `kitchain-discovery-pantry:${API_BASE}`;
      const legacy = await AsyncStorage.getItem(legacyKey).catch(() => null);
      if (ticket !== sequence.current) return;
      if (legacy && pantry.revision === 0) {
        pantry = await pantryApi.save({ items: validatePantry(ingredientList(legacy)), revision: 0 });
        await AsyncStorage.removeItem(legacyKey).catch(() => {});
      }
      if (ticket !== sequence.current) return;
      await writes.current;
      const cachedText = !discardDraft ? await AsyncStorage.getItem(key).catch(() => null) : null;
      let cached: { text: string; revision: number } | null = null;
      try {
        const parsed = cachedText ? JSON.parse(cachedText) : null;
        if (parsed && typeof parsed.text === "string" && Number.isSafeInteger(parsed.revision) && parsed.revision >= 0) cached = parsed;
      } catch { /* Saved server items remain available if a local draft is corrupt. */ }
      if (ticket !== sequence.current) return;
      const keepEdits = !discardDraft && dirtyRef.current;
      const value = keepEdits ? textRef.current : cached?.text ?? pantry.items.join("\n");
      // Keep the draft's original revision so newer server changes still cause a conflict.
      revision.current = keepEdits ? revision.current : cached?.revision ?? pantry.revision;
      textRef.current = value; setText(value);
      dirtyRef.current = value !== pantry.items.join("\n"); setDirty(dirtyRef.current);
      if (discardDraft) await AsyncStorage.removeItem(key).catch(() => {});
      setReady(true);
    } catch (e) {
      if (ticket === sequence.current) setError(e instanceof Error ? e.message : "Could not open your pantry.");
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { sequence.current++; };
  }, [load]));

  function edit(value: string) {
    textRef.current = value; setText(value);
    dirtyRef.current = true; setDirty(true); setNotice("");
    if (cacheKey.current) {
      const key = cacheKey.current;
      const draft = JSON.stringify({ text: value, revision: revision.current });
      writes.current = writes.current.then(() => AsyncStorage.setItem(key, draft)).catch(() => {
        setError("Your draft could not be kept on this device. Save your pantry before leaving this page.");
      });
    }
  }

  async function save() {
    if (!ready || saveLock.current) return false;
    saveLock.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const submittedDraft = JSON.stringify({ text: textRef.current, revision: revision.current });
      const items = validatePantry(ingredientList(textRef.current));
      const result = await pantryApi.save({ items, revision: revision.current });
      revision.current = result.revision;
      const value = result.items.join("\n");
      textRef.current = value; setText(value);
      dirtyRef.current = false; setDirty(false);
      await writes.current;
      // A different mounted screen may already have cached a newer draft.
      const cached = await AsyncStorage.getItem(cacheKey.current).catch(() => null);
      if (cached === submittedDraft) await AsyncStorage.removeItem(cacheKey.current).catch(() => {});
      setNotice("Pantry saved for your cook profile.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your pantry. Your edits are still here.");
      return false;
    } finally { saveLock.current = false; setSaving(false); }
  }

  return { text, edit, ready, saving, dirty, error, notice, save, reload: () => load(true) };
}
