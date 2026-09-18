import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { View, Text, Pressable, Image, Alert, ScrollView, TextInput } from "react-native";
import Constants from "expo-constants";

const BASE =
  (Constants.expoConfig as any)?.extra?.apiBase ??
  process.env.EXPO_PUBLIC_API_BASE ??
  "http://192.168.x.x:8000";

type ScanMode = "printed" | "handwritten";
type HandwritingProfile = {
  id: number;
  name: string;
  relationship?: string | null;
};

function ingredientToText(item: any): string {
  if (typeof item === "string") return item.trim();

  if (item && typeof item === "object") {
    const name = String(item.name || "").trim();
    const quantity = String(item.quantity || "").trim();

    if (name && quantity) {
      const nameLooksLikeItAlreadyHasAmount =
        /^\s*\d|^\s*[¼½¾⅓⅔⅛⅜⅝⅞]/.test(name);

      // If Qwen put the amount inside name, trust name and don't duplicate quantity.
      if (nameLooksLikeItAlreadyHasAmount) {
        return name;
      }

      return `${quantity} ${name}`.trim();
    }

    return name || quantity;
  }

  return "";
}

export default function AddFromPhoto() {
  const [uri, setUri] = useState<string | null>(null);
  const [text, setText] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [ingredientsText, setIngredientsText] = useState<string>("");
  const [stepsText, setStepsText] = useState<string>("");
  const [notesText, setNotesText] = useState<string>("");

  const [scanMode, setScanMode] = useState<ScanMode>("printed");
  const [profiles, setProfiles] = useState<HandwritingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [newProfileName, setNewProfileName] = useState<string>("");

  const [scanId, setScanId] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<string>("");
  const [uncertainLines, setUncertainLines] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    try {
      const res = await fetch(`${BASE}/api/v1/handwriting-profiles/`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setProfiles(data || []);
    } catch (e) {
      // Keep this quiet so scanning still works if profiles endpoint is offline.
      console.log("Profile load error", e);
    }
  }

  async function createProfile() {
    const name = newProfileName.trim();
    if (!name) return Alert.alert("Profile name required");

    try {
      const res = await fetch(`${BASE}/api/v1/handwriting-profiles/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const profile = await res.json();
      setProfiles((prev) => [...prev, profile]);
      setSelectedProfileId(profile.id);
      setNewProfileName("");
    } catch (e: any) {
      Alert.alert("Profile error", String(e?.message || e));
    }
  }

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled) setUri(res.assets[0].uri);
  }

  async function scan() {
    if (!uri) return Alert.alert("Pick an image first");

    setScanning(true);

    try {
      const form = new FormData();
      // @ts-ignore React Native file object for FormData
      form.append("file", {
        uri,
        name: "recipe.jpg",
        type: "image/jpeg",
      });

      const params = new URLSearchParams({ mode: scanMode });
      if (selectedProfileId) params.append("handwriting_profile_id", String(selectedProfileId));

      const res = await fetch(`${BASE}/api/v1/recipes/scan?${params.toString()}`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const data = await res.json();

      setScanId(data?.scan_id ?? null);
      setConfidence(data?.confidence || "");
      setUncertainLines(data?.uncertain_lines || []);
      setTitle((data?.title || "").slice(0, 80));
      setText(data?.raw_text || "");

      const ingredients = (data?.ingredients || [])
        .map(ingredientToText)
        .filter(Boolean);

      setIngredientsText(ingredients.join("\n"));
      setStepsText((data?.steps || []).join("\n"));
      setNotesText((data?.notes || []).join("\n"));
    } catch (e: any) {
      Alert.alert("Scan error", String(e?.message || e));
    } finally {
      setScanning(false);
    }
  }

  async function saveCorrectionForLearning(ingredients: string[], steps: string[]) {
    if (!scanId) return;

    try {
      await fetch(`${BASE}/api/v1/scans/${scanId}/correction`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ingredients,
          steps,
          handwriting_profile_id: selectedProfileId,
        }),
      });
    } catch (e) {
      console.log("Correction save error", e);
    }
  }

  async function saveAsRecipe() {
    if (!title.trim()) return Alert.alert("Title required");

    const ingredients = ingredientsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const notes = notesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const stepsWithNotes = [
      ...steps,
      ...notes.map((n) => `Note: ${n}`),
    ];

    try {
      const res = await fetch(`${BASE}/api/v1/recipes/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: "Scanned",
          ingredients,
          steps: stepsWithNotes,
          instructions: stepsWithNotes.join("\n\n"),
          handwriting_profile_id: selectedProfileId,
        }),
      });

      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      await saveCorrectionForLearning(ingredients, stepsWithNotes);
      Alert.alert("Saved!", "Recipe created and handwriting corrections stored.");
    } catch (e: any) {
      Alert.alert("Save error", String(e?.message || e));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Add from Photo</Text>

      {uri ? <Image source={{ uri }} style={{ width: "100%", height: 240, borderRadius: 10 }} /> : null}

      <Text style={{ fontWeight: "600" }}>Scan type</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["printed", "handwritten"] as ScanMode[]).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => setScanMode(mode)}
            style={{
              backgroundColor: scanMode === mode ? "#1e73ff" : "#eee",
              padding: 10,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: scanMode === mode ? "#fff" : "#111", textTransform: "capitalize" }}>
              {mode}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ fontWeight: "600" }}>Who wrote this?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          onPress={() => setSelectedProfileId(null)}
          style={{ backgroundColor: selectedProfileId === null ? "#1e73ff" : "#eee", padding: 10, borderRadius: 10 }}
        >
          <Text style={{ color: selectedProfileId === null ? "#fff" : "#111" }}>Unknown</Text>
        </Pressable>
        {profiles.map((profile) => (
          <Pressable
            key={profile.id}
            onPress={() => setSelectedProfileId(profile.id)}
            style={{ backgroundColor: selectedProfileId === profile.id ? "#1e73ff" : "#eee", padding: 10, borderRadius: 10 }}
          >
            <Text style={{ color: selectedProfileId === profile.id ? "#fff" : "#111" }}>{profile.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={newProfileName}
          onChangeText={setNewProfileName}
          placeholder="Add person, e.g. Grandma Carol"
          style={{ flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 }}
        />
        <Pressable onPress={createProfile} style={{ backgroundColor: "#eee", padding: 12, borderRadius: 10 }}>
          <Text>Add</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable onPress={pickImage} style={{ backgroundColor: "#eee", padding: 12, borderRadius: 10 }}>
          <Text>Pick Image</Text>
        </Pressable>
        <Pressable
          onPress={scan}
          disabled={scanning}
          style={{
            backgroundColor: scanning ? "#93c5fd" : "#1e73ff",
            padding: 12,
            borderRadius: 10,
            opacity: scanning ? 0.8 : 1,
          }}
        >
          <Text style={{ color: "#fff" }}>
            {scanning ? "Scanning…" : "Scan"}
          </Text>
        </Pressable>    
      </View>

      {scanning ? (
        <View style={{ backgroundColor: "#eff6ff", padding: 12, borderRadius: 10 }}>
          <Text style={{ fontWeight: "600" }}>Reading recipe card…</Text>
          <Text style={{ color: "#555", marginTop: 4 }}>
            Handwritten scans can take a minute while the local AI model works.
          </Text>
        </View>
      ) : null}

      {!!confidence && <Text>Scan confidence: {confidence}</Text>}
      {uncertainLines.length > 0 && (
        <Text style={{ color: "#92400e" }}>Needs review: {uncertainLines.join("; ")}</Text>
      )}

      {!!text && (
        <>
          <Text style={{ fontWeight: "600", marginTop: 8 }}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 }}
          />

          <Text style={{ fontWeight: "600", marginTop: 8 }}>Ingredients (one per line)</Text>
          <TextInput
            value={ingredientsText}
            onChangeText={setIngredientsText}
            multiline
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, minHeight: 120 }}
          />

          <Text style={{ fontWeight: "600", marginTop: 8 }}>Steps (one per line)</Text>
          <TextInput
            value={stepsText}
            onChangeText={setStepsText}
            multiline
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, minHeight: 140 }}
          />

          <Text style={{ fontWeight: "600", marginTop: 8 }}>Notes / Optional Add-ins</Text>
          <TextInput
            value={notesText}
            onChangeText={setNotesText}
            multiline
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, minHeight: 100 }}
          />

          <Text style={{ fontWeight: "600", marginTop: 8 }}>OCR Text</Text>
          <Text style={{ borderWidth: 1, borderColor: "#eee", padding: 10, borderRadius: 8 }}>
            {text}
          </Text>

          <Pressable
            onPress={saveAsRecipe}
            style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 10, marginTop: 12 }}
          >
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
              Save Recipe
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
