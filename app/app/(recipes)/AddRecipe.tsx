import { useRef, useState } from "react";
import { Text, TextInput, Alert, ScrollView } from "react-native";
import { HapticPressable as Pressable } from "@/components/HapticPressable";
import { feedback } from "@/lib/haptics";
import { api } from "../../lib/api";
import { useRouter } from "expo-router";

export default function AddRecipe() {
  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);

  async function submit() {
    if (saveLock.current) return;
    if (!title.trim()) return Alert.alert("Title required");
    saveLock.current = true;
    setSaving(true);
    try {
      const instructionsText =
        `Ingredients:\n` +
        ingredients
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => `- ${s}`)
          .join("\n") +
        `\n\nSteps:\n` +
        steps
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n");

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructionsText.trim(),
        ingredients: ingredients.split("\n").map((line) => line.trim()).filter(Boolean),
        steps: steps.split("\n").map((line) => line.trim()).filter(Boolean),
      };
      await api.createRecipe(payload);
      feedback("success");
      Alert.alert("Saved!", "Recipe created.");
      router.replace("/(recipes)");
    } catch (e:any) {
      feedback("error");
      Alert.alert("Error", String(e?.message || e));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding:16, gap:12 }}>
      <Text style={{ fontSize:20, fontWeight:"600" }}>Add Recipe</Text>
      <TextInput editable={!saving} placeholder="Title" value={title} onChangeText={setTitle}
        style={{ borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <TextInput editable={!saving} placeholder="Short description" value={description} onChangeText={setDesc}
        style={{ borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <Text style={{ fontWeight:"600" }}>Ingredients (one per line)</Text>
      <TextInput editable={!saving} multiline value={ingredients} onChangeText={setIngredients}
        style={{ minHeight:100, borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <Text style={{ fontWeight:"600" }}>Steps (one per line)</Text>
      <TextInput editable={!saving} multiline value={steps} onChangeText={setSteps}
        style={{ minHeight:100, borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <Pressable onPress={submit} disabled={saving} style={{ backgroundColor:"#1e73ff", padding:14, borderRadius:10 }}>
        <Text style={{ color:"#fff", textAlign:"center", fontWeight:"600" }}>{saving ? "Saving…" : "Save"}</Text>
      </Pressable>
    </ScrollView>
  );
}
