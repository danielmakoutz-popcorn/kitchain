import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { router } from "expo-router";
import { kitchen as c } from "@/constants/kitchen";
import { KitchenButton, KitchenHeading, KitchenInput, KitchenNotice, KitchenScroll, KitchenText as Text, PixelFrame, PixelIcon, ReadingRecipe, ScannerFrame, useKitchenDialog } from "@/components/kitchen";
import { ArtSlot } from "@/components/ArtSlot";
import { requestJson } from "@/lib/api";
import { feedback } from "@/lib/haptics";
import { photoForm } from "@/lib/photos";
import { ScanResponseSchema } from "@/lib/types";
import { keepDraftPhoto } from "@/lib/draft-platform";
import { useScanDraft } from "@/hooks/use-scan-draft";

type HandwritingProfile = { id: number; name: string };

export default function AddFromPhoto() {
  const Alert = useKitchenDialog();
  const { draft, ready, recovered, storageError, savingDraft, recoveryDisabled, continueWithoutRecovery, update, clear, reload } = useScanDraft();
  const { photo, result, title, ingredientsText, stepsText, notesText, selectedProfileId, newProfileName } = draft;
  const setTitle = (value: string) => { void update({ title: value }); };
  const setIngredientsText = (value: string) => { void update({ ingredientsText: value }); };
  const setStepsText = (value: string) => { void update({ stepsText: value }); };
  const setNotesText = (value: string) => { void update({ notesText: value }); };
  const setSelectedProfileId = (value: number | null) => { void update({ selectedProfileId: value }); };
  const setNewProfileName = (value: string) => { void update({ newProfileName: value }); };
  const [profiles, setProfiles] = useState<HandwritingProfile[]>([]);
  const [profileError, setProfileError] = useState("");
  const [scanError, setScanError] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const scanController = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  const profileLock = useRef(false);
  const pickerLock = useRef(false);
  const mounted = useRef(false);
  const busy = scanning || saving || creatingProfile || pickingPhoto || discarding || !ready || draft.savedRecipeId !== null;

  useEffect(() => {
    mounted.current = true;
    void loadProfiles();
    return () => { mounted.current = false; scanController.current?.abort(); scanController.current = null; };
  }, []);

  async function loadProfiles() {
    try {
      setProfiles(await requestJson<HandwritingProfile[]>("/api/v1/handwriting-profiles/"));
      setProfileError("");
    } catch {
      setProfileError("Writer profiles are unavailable. You can still scan with Unknown selected.");
    }
  }

  async function createProfile() {
    if (profileLock.current || scanController.current || saveLock.current) return;
    const name = newProfileName.trim();
    if (!name) return Alert.alert("Profile name required");
    profileLock.current = true;
    setCreatingProfile(true);
    try {
      const profile = await requestJson<HandwritingProfile>("/api/v1/handwriting-profiles/", {
        method: "POST", body: JSON.stringify({ name }),
      });
      setProfiles((prev) => [...prev, profile]);
      setSelectedProfileId(profile.id);
      setNewProfileName("");
      feedback("success");
    } catch (error) {
      feedback("error");
      Alert.alert("Profile error", error instanceof Error ? error.message : "Could not add this writer.");
    } finally {
      profileLock.current = false;
      setCreatingProfile(false);
    }
  }

  async function pickImage() {
    if (busy || pickerLock.current) return;
    pickerLock.current = true;
    setPickingPhoto(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (picked.canceled || !picked.assets[0]) return;
      const replace = async () => {
        setPickingPhoto(true);
        try {
          const keptPhoto = await keepDraftPhoto(picked.assets[0]);
          await update({ photo: keptPhoto, result: null, title: "", ingredientsText: "", stepsText: "", notesText: "", savedRecipeId: null });
          setScanError(""); setShowRaw(false);
        } catch (error) {
          feedback("error");
          Alert.alert("Photo error", error instanceof Error ? error.message : "Could not keep a copy of this photo for your draft.");
        } finally { setPickingPhoto(false); }
      };
      if (result) {
        Alert.alert("Replace this scan?", "Your unsaved review will be cleared when you choose another photo.", [
          { text: "Keep review", style: "cancel" }, { text: "Replace photo", onPress: () => void replace() },
        ]);
      } else await replace();
    } catch (error) {
      feedback("error");
      Alert.alert("Photo error", error instanceof Error ? error.message : "Could not open your photos.");
    } finally {
      pickerLock.current = false;
      setPickingPhoto(false);
    }
  }

  async function scan() {
    if (!photo || !ready || draft.savedRecipeId !== null || scanController.current || saveLock.current || profileLock.current) return;
    const controller = new AbortController();
    scanController.current = controller;
    setScanning(true);
    setScanError("");
    const timeout = setTimeout(() => controller.abort(), 330_000);
    try {
      const params = new URLSearchParams({ mode: "handwritten" });
      if (selectedProfileId !== null) params.set("handwriting_profile_id", String(selectedProfileId));
      const form = await photoForm(photo);
      const data = await requestJson<unknown>(`/api/v1/recipes/scan?${params}`, {
        method: "POST", body: form, signal: controller.signal,
      });
      if (scanController.current !== controller) return;
      const parsed = ScanResponseSchema.safeParse(data);
      if (!parsed.success) throw new Error("The server returned an unreadable scan. Try scanning again.");
      await update({ result: parsed.data, title: parsed.data.title,
        ingredientsText: parsed.data.ingredients.join("\n"), stepsText: parsed.data.steps.join("\n"), notesText: parsed.data.notes.join("\n") });
      if (scanController.current !== controller) return;
      setShowRaw(false);
      feedback(parsed.data.uncertain_lines.length ? "warning" : "success");
    } catch (error) {
      if (scanController.current !== controller) return;
      setScanError(controller.signal.aborted ? "This scan took too long. You can try again."
        : error instanceof Error ? error.message : "Could not scan this photo. Try again.");
      feedback("error");
    } finally {
      clearTimeout(timeout);
      if (scanController.current === controller) {
        scanController.current = null;
        setScanning(false);
      }
    }
  }

  function requestScan() {
    if (result) {
      Alert.alert("Scan this photo again?", "A successful new scan will replace your current edits.", [
        { text: "Keep review", style: "cancel" }, { text: "Scan again", onPress: () => void scan() },
      ]);
    } else void scan();
  }

  function cancelScan() {
    scanController.current?.abort();
    scanController.current = null;
    setScanning(false);
    setScanError("Stopped waiting for this scan. Your local AI may finish in the background.");
  }

  async function saveAsRecipe() {
    if (!result || !ready || draft.savedRecipeId !== null || saveLock.current || scanController.current || profileLock.current) return;
    if (!title.trim()) return Alert.alert("Title required");
    saveLock.current = true;
    setSaving(true);
    const toLines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
    const ingredients = toLines(ingredientsText);
    const steps = [...toLines(stepsText), ...toLines(notesText).map((note) => `Note: ${note}`)];
    const payload = { title: title.trim(), ingredients, steps, handwriting_profile_id: selectedProfileId };
    try {
      const recipe = await requestJson<{ id: number }>(`/api/v1/recipes/?source_scan_id=${result.scan_id}`, {
        method: "POST", body: JSON.stringify({ ...payload, description: "Scanned", instructions: steps.join("\n\n") }),
      });
      let correctionsSaved = true;
      try {
        await requestJson(`/api/v1/scans/${result.scan_id}/correction`, { method: "PATCH", body: JSON.stringify(payload) });
      } catch { correctionsSaved = false; }
      const draftCleared = await clear(recipe.id);
      if (!mounted.current) return;
      feedback(correctionsSaved && draftCleared ? "success" : "warning");
      Alert.alert("Recipe saved", "Your recipe and original photo were saved."
        + (correctionsSaved ? "" : " Its correction record could not be updated.")
        + (draftCleared ? "" : " The local draft could not be cleared."));
      router.replace(`/(recipes)/${recipe.id}`);
    } catch (error) {
      if (!mounted.current) return;
      feedback("error");
      Alert.alert("Save error", error instanceof Error ? error.message : "Could not save your recipe.");
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function discardDraft() {
    Alert.alert("Discard unfinished recipe?", "Your unfinished edits will be cleared.", [
      { text: "Keep draft", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: async () => {
        setDiscarding(true);
        const removed = await clear();
        if (removed) { setScanError(""); setShowRaw(false); feedback("selection"); }
        setDiscarding(false);
      } },
    ]);
  }

  return <KitchenScroll contentContainerStyle={{ paddingBottom: 80 }}>
      <KitchenHeading subtitle="Turn a recipe card into a recipe you can keep.">Add from photo</KitchenHeading>
      {!ready && !storageError && <ActivityIndicator color={c.greenInk} accessibilityLabel="Opening saved draft" />}
      {recovered && <KitchenNotice kind="success">Recovered your unfinished recipe from this device.</KitchenNotice>}
      {!!storageError && <KitchenNotice kind="error" title="Draft storage needs attention">
        <Text>{storageError}</Text>
        <KitchenButton compact disabled={scanning || saving || discarding} onPress={() => ready ? void update({}) : void reload()}>Retry draft storage</KitchenButton>
        {!ready && <KitchenButton compact disabled={discarding} onPress={continueWithoutRecovery}>Continue without recovery</KitchenButton>}
      </KitchenNotice>}
      {recoveryDisabled && <Text style={{ color: c.redInk }}>Draft recovery is off for this screen. Keep it open until you save the recipe.</Text>}
      {draft.savedRecipeId !== null && <KitchenNotice title="This recipe is already saved">
        <Text>You can open it or discard the leftover draft.</Text>
        <KitchenButton onPress={() => router.replace(`/(recipes)/${draft.savedRecipeId}`)}>Open saved recipe</KitchenButton>
      </KitchenNotice>}
      {(photo || storageError) && <View style={{ gap: 10 }}>
        {photo && !recoveryDisabled && <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 14 }}>{savingDraft ? "Saving draft…" : storageError ? "Draft save needs attention" : "Draft saved on this device"}</Text>}
        <KitchenButton compact haptic="warning" disabled={scanning || saving || creatingProfile || pickingPhoto || discarding} onPress={discardDraft}>Discard draft</KitchenButton>
      </View>}
      <Text>Choose a clear recipe photo. The local AI will read it, then you can review and edit before saving.</Text>
      {photo ? <ScannerFrame reading={scanning}><Image source={{ uri: photo.uri }} resizeMode="contain" style={{ width: "100%", height: 260 }} accessibilityLabel="Selected recipe photo" /></ScannerFrame> : <ScannerFrame><View style={{ minHeight: 160, justifyContent: "center", alignItems: "center", gap: 12 }}><ArtSlot name="scanButton" fallback={<PixelIcon name="scan" size={42} color={c.greenShade} />} /><Text style={{ color: c.muted }}>Your recipe photo goes here</Text></View></ScannerFrame>}
      <PixelFrame contentStyle={{ padding: 18, gap: 12 }}>
        <Text style={{ fontWeight: "700" }}>Who wrote this? · optional</Text>
        {profileError ? <View style={{ gap: 10 }}><Text>{profileError}</Text><KitchenButton compact disabled={busy} onPress={loadProfiles}>Retry profiles</KitchenButton></View> : null}
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[{ id: null, name: "Unknown" }, ...profiles].map(profile => <KitchenButton compact key={String(profile.id)} haptic="selection" disabled={busy} variant={selectedProfileId === profile.id ? "primary" : "neutral"} accessibilityRole="radio" accessibilityState={{ selected: selectedProfileId === profile.id }} onPress={() => setSelectedProfileId(profile.id)}>{profile.name}</KitchenButton>)}
        </View>
        <KitchenInput value={newProfileName} onChangeText={setNewProfileName} editable={!busy} placeholder="Add a writer, e.g. Grandma Carol" accessibilityLabel="New writer name" />
        <KitchenButton compact disabled={busy || !newProfileName.trim()} onPress={createProfile} icon="plus">{creatingProfile ? "Adding…" : "Add writer"}</KitchenButton>
      </PixelFrame>
      <KitchenButton onPress={pickImage} disabled={busy} icon="plus">{photo ? "Replace photo" : "Choose a photo"}</KitchenButton>
      <KitchenButton onPress={requestScan} disabled={!photo || busy} variant="primary">
        <ArtSlot name="scanButton" scale={1} fallback={<PixelIcon name="scan" />} />
        <Text style={{ fontWeight: "700", flexShrink: 1 }}>{scanning ? "Scanning…" : result ? "Scan again" : "Scan with AI"}</Text>
      </KitchenButton>
      {scanning && <KitchenNotice>
        <ReadingRecipe />
        <Text>The local AI can take a few minutes. Your photo will stay here while you wait.</Text>
        <KitchenButton haptic="selection" onPress={cancelScan}>Stop waiting</KitchenButton>
      </KitchenNotice>}
      {!!scanError && <KitchenNotice kind="error" title="This scan needs attention"><ArtSlot name="scanError" /><Text style={{ color: c.redInk }}>{scanError}</Text></KitchenNotice>}
      {result && <PixelFrame ornate contentStyle={{ padding: 24, gap: 16 }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><ArtSlot name="scanReady" fallback={<PixelIcon name="check" color={c.greenInk} />} /><Text accessibilityRole="header" style={{ fontWeight: "700", fontSize: 20 }}>Review your recipe</Text></View>
        <Text>Check names, amounts, and cooking times against your photo before saving.</Text>
        <Text style={{ color: c.muted, fontSize: 14 }}>Review hint: {result.confidence}. This is not an accuracy score.</Text>
        {result.uncertain_lines.length > 0 && <KitchenNotice title="Take another look">{result.uncertain_lines.join("; ")}</KitchenNotice>}
        <KitchenInput label="Title" accessibilityLabel="Recipe title" value={title} onChangeText={setTitle} editable={!busy} />
        <KitchenInput label="Ingredients · one per line" accessibilityLabel="Recipe ingredients" value={ingredientsText} onChangeText={setIngredientsText} editable={!busy} multiline />
        <KitchenInput label="Directions · one step per line" accessibilityLabel="Recipe steps" value={stepsText} onChangeText={setStepsText} editable={!busy} multiline style={{ minHeight: 140 }} />
        <KitchenInput label="Notes / optional add-ins" accessibilityLabel="Recipe notes" value={notesText} onChangeText={setNotesText} editable={!busy} multiline />
        <KitchenButton compact haptic="selection" onPress={() => setShowRaw(!showRaw)} accessibilityState={{ expanded: showRaw }}>{showRaw ? "Hide original AI response" : "Show original AI response"}</KitchenButton>
        {showRaw && <Text selectable style={{ color: c.muted }}>{result.raw_text || "No raw response provided."}</Text>}
        <KitchenButton onPress={saveAsRecipe} disabled={busy || !title.trim()} variant="primary" icon="save">{saving ? "Saving…" : "Save recipe"}</KitchenButton>
      </PixelFrame>}
    </KitchenScroll>;
}
