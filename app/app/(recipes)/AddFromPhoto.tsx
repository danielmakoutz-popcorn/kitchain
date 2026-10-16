import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { HapticPressable } from "@/components/HapticPressable";
import { ArtSlot } from "@/components/ArtSlot";
import { requestJson } from "@/lib/api";
import { feedback } from "@/lib/haptics";
import { photoForm } from "@/lib/photos";
import { ScanResponseSchema, type ScanResponse } from "@/lib/types";

type HandwritingProfile = { id: number; name: string };
const fieldStyle = { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 };
const buttonStyle = { backgroundColor: "#eee", padding: 12, borderRadius: 10 };

export default function AddFromPhoto() {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [title, setTitle] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [notesText, setNotesText] = useState("");
  const [profiles, setProfiles] = useState<HandwritingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [profileError, setProfileError] = useState("");
  const [scanError, setScanError] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const scanController = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  const profileLock = useRef(false);
  const busy = scanning || saving || creatingProfile;

  useEffect(() => {
    void loadProfiles();
    return () => { scanController.current?.abort(); scanController.current = null; };
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
    if (busy) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (picked.canceled || !picked.assets[0]) return;
      const replace = () => {
        setPhoto(picked.assets[0]);
        setResult(null);
        setTitle(""); setIngredientsText(""); setStepsText(""); setNotesText("");
        setScanError(""); setShowRaw(false);
      };
      if (result) {
        Alert.alert("Replace this scan?", "Your unsaved review will be cleared when you choose another photo.", [
          { text: "Keep review", style: "cancel" }, { text: "Replace photo", onPress: replace },
        ]);
      } else replace();
    } catch (error) {
      feedback("error");
      Alert.alert("Photo error", error instanceof Error ? error.message : "Could not open your photos.");
    }
  }

  async function scan() {
    if (!photo || scanController.current || saveLock.current || profileLock.current) return;
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
      setResult(parsed.data);
      setTitle(parsed.data.title);
      setIngredientsText(parsed.data.ingredients.join("\n"));
      setStepsText(parsed.data.steps.join("\n"));
      setNotesText(parsed.data.notes.join("\n"));
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
    if (!result || saveLock.current || scanController.current || profileLock.current) return;
    if (!title.trim()) return Alert.alert("Title required");
    saveLock.current = true;
    setSaving(true);
    const toLines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
    const ingredients = toLines(ingredientsText);
    const steps = [...toLines(stepsText), ...toLines(notesText).map((note) => `Note: ${note}`)];
    const payload = { title: title.trim(), ingredients, steps, handwriting_profile_id: selectedProfileId };
    try {
      const recipe = await requestJson<{ id: number }>("/api/v1/recipes/", {
        method: "POST", body: JSON.stringify({ ...payload, description: "Scanned", instructions: steps.join("\n\n") }),
      });
      let correctionsSaved = true;
      try {
        await requestJson(`/api/v1/scans/${result.scan_id}/correction`, { method: "PATCH", body: JSON.stringify(payload) });
      } catch { correctionsSaved = false; }
      feedback(correctionsSaved ? "success" : "warning");
      Alert.alert("Recipe saved", correctionsSaved ? "Your reviewed recipe and correction record were saved."
        : "Your recipe was saved, but its correction record could not be updated.");
      router.replace(`/(recipes)/${recipe.id}`);
    } catch (error) {
      feedback("error");
      Alert.alert("Save error", error instanceof Error ? error.message : "Could not save your recipe.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={80}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>Add from Photo</Text>
        <Text>Choose a clear recipe photo. The local AI will read it, then you can review and edit before saving.</Text>
        {photo && <Image source={{ uri: photo.uri }} resizeMode="contain" style={{ width: "100%", height: 240, borderRadius: 10 }} accessibilityLabel="Selected recipe photo" />}
        <Text style={{ fontWeight: "600" }}>Who wrote this? (optional)</Text>
        {profileError ? <View style={{ gap: 8 }}>
          <Text>{profileError}</Text>
          <HapticPressable disabled={busy} onPress={loadProfiles} style={buttonStyle}><Text>Retry profiles</Text></HapticPressable>
        </View> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[{ id: null, name: "Unknown" }, ...profiles].map((profile) => (
            <HapticPressable key={String(profile.id)} haptic="selection" disabled={busy}
              accessibilityRole="radio" accessibilityState={{ selected: selectedProfileId === profile.id }}
              onPress={() => setSelectedProfileId(profile.id)}
              style={{ ...buttonStyle, backgroundColor: selectedProfileId === profile.id ? "#1e73ff" : "#eee" }}>
              <Text style={{ color: selectedProfileId === profile.id ? "#fff" : "#111" }}>{profile.name}</Text>
            </HapticPressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput value={newProfileName} onChangeText={setNewProfileName} editable={!busy}
            placeholder="Add person, e.g. Grandma Carol" accessibilityLabel="New writer name" style={{ ...fieldStyle, flex: 1 }} />
          <HapticPressable disabled={busy || !newProfileName.trim()} onPress={createProfile} style={buttonStyle}>
            <Text>{creatingProfile ? "Adding…" : "Add"}</Text>
          </HapticPressable>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <HapticPressable onPress={pickImage} disabled={busy} style={buttonStyle}><Text>{photo ? "Replace photo" : "Pick photo"}</Text></HapticPressable>
          <HapticPressable onPress={requestScan} disabled={!photo || busy}
            style={{ ...buttonStyle, backgroundColor: "#1e73ff", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ArtSlot name="scanButton" scale={1} />
            <Text style={{ color: "#fff" }}>{scanning ? "Scanning…" : result ? "Scan again" : "Scan with AI"}</Text>
          </HapticPressable>
        </View>
        {scanning && <View accessibilityLiveRegion="polite" style={{ backgroundColor: "#eff6ff", padding: 12, borderRadius: 10, gap: 8 }}>
          <ArtSlot name="scanWorking" fallback={<ActivityIndicator accessibilityLabel="Reading recipe" />} />
          <Text style={{ fontWeight: "600" }}>Reading recipe card…</Text>
          <Text>The local AI can take a few minutes. Your photo will stay here while you wait.</Text>
          <HapticPressable haptic="selection" onPress={cancelScan} style={buttonStyle}><Text>Stop waiting</Text></HapticPressable>
        </View>}
        {!!scanError && <View accessibilityLiveRegion="polite" style={{ backgroundColor: "#fef2f2", padding: 12, borderRadius: 10, gap: 8 }}>
          <ArtSlot name="scanError" /><Text style={{ color: "#991b1b" }}>{scanError}</Text>
        </View>}
        {result && <>
          <ArtSlot name="scanReady" />
          <Text style={{ fontSize: 18, fontWeight: "600" }}>Review your recipe</Text>
          <Text>Check names, amounts, and cooking times against your photo before saving.</Text>
          <Text>Review hint: {result.confidence}. This is not an accuracy score.</Text>
          {result.uncertain_lines.length > 0 && <Text style={{ color: "#92400e" }}>Needs review: {result.uncertain_lines.join("; ")}</Text>}
          <Text style={{ fontWeight: "600" }}>Title</Text>
          <TextInput accessibilityLabel="Recipe title" value={title} onChangeText={setTitle} editable={!busy} style={fieldStyle} />
          <Text style={{ fontWeight: "600" }}>Ingredients (one per line)</Text>
          <TextInput accessibilityLabel="Recipe ingredients" value={ingredientsText} onChangeText={setIngredientsText} editable={!busy} multiline style={{ ...fieldStyle, minHeight: 120, textAlignVertical: "top" }} />
          <Text style={{ fontWeight: "600" }}>Steps (one per line)</Text>
          <TextInput accessibilityLabel="Recipe steps" value={stepsText} onChangeText={setStepsText} editable={!busy} multiline style={{ ...fieldStyle, minHeight: 140, textAlignVertical: "top" }} />
          <Text style={{ fontWeight: "600" }}>Notes / Optional Add-ins</Text>
          <TextInput accessibilityLabel="Recipe notes" value={notesText} onChangeText={setNotesText} editable={!busy} multiline style={{ ...fieldStyle, minHeight: 100, textAlignVertical: "top" }} />
          <HapticPressable haptic="selection" onPress={() => setShowRaw(!showRaw)} style={buttonStyle} accessibilityState={{ expanded: showRaw }}>
            <Text>{showRaw ? "Hide" : "Show"} original AI response</Text>
          </HapticPressable>
          {showRaw && <Text selectable style={fieldStyle}>{result.raw_text || "No raw response provided."}</Text>}
          <HapticPressable onPress={saveAsRecipe} disabled={busy || !title.trim()} style={{ ...buttonStyle, backgroundColor: "#16a34a", marginTop: 12 }}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>{saving ? "Saving…" : "Save Recipe"}</Text>
          </HapticPressable>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
