import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ScrollView } from "react-native";
import { api } from "../../lib/api";
import { useRouter } from "expo-router";

export default function AddRecipe() {
  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");
  const router = useRouter();

  async function submit() {
    if (!title.trim()) return Alert.alert("Title required");
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
      };
      console.log("Creating recipe at:", process.env.EXPO_PUBLIC_API_BASE + "/api/v1/recipes/");
      await api.createRecipe(payload);
      Alert.alert("Saved!", "Recipe created.");
      router.replace("/(recipes)");
    } catch (e:any) {
      Alert.alert("Error", String(e?.message || e));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding:16, gap:12 }}>
      <Text style={{ fontSize:20, fontWeight:"600" }}>Add Recipe</Text>
      <TextInput placeholder="Title" value={title} onChangeText={setTitle}
        style={{ borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <TextInput placeholder="Short description" value={description} onChangeText={setDesc}
        style={{ borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <Text style={{ fontWeight:"600" }}>Ingredients (one per line)</Text>
      <TextInput multiline value={ingredients} onChangeText={setIngredients}
        style={{ minHeight:100, borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <Text style={{ fontWeight:"600" }}>Steps (one per line)</Text>
      <TextInput multiline value={steps} onChangeText={setSteps}
        style={{ minHeight:100, borderWidth:1, borderColor:"#ddd", borderRadius:8, padding:10 }} />
      <Pressable onPress={submit} style={{ backgroundColor:"#1e73ff", padding:14, borderRadius:10 }}>
        <Text style={{ color:"#fff", textAlign:"center", fontWeight:"600" }}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}
