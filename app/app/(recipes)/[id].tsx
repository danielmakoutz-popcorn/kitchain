import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, Alert, Image, KeyboardAvoidingView, Platform } from "react-native";
import { HapticPressable as Pressable } from "@/components/HapticPressable";
import { feedback } from "@/lib/haptics";
import { photoForm } from "@/lib/photos";
import { useLocalSearchParams, router } from "expo-router";
import { api, API_BASE as BASE, requestJson, tryParse } from "../../lib/api";
import { Recipe, RecipeSchema } from "../../lib/types";
import * as ImagePicker from "expo-image-picker";

function listToText(value: unknown): string {
  if (Array.isArray(value)) return value.join("\n");
  if (typeof value === "string") return value;
  return "";
}

function textToList(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeDetailContent key={id} id={id} />;
}

function RecipeDetailContent({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);

  const loadRecipe = useCallback(() => {
    return api.getRecipe(id).then((raw) => {
      const parsed = tryParse(RecipeSchema, raw);
      setRecipe(parsed);

      setTitle(parsed.title || "");
      setDescription(parsed.description || "");
      setIngredientsText(listToText(parsed.ingredients));
      setStepsText(listToText(parsed.steps));
      setPhotoUri(parsed.image_path ? `${BASE}${parsed.image_path}` : "");
    }).catch((e) => {
      console.warn("getRecipe error", e);
      setError("Could not load this recipe. It may have been deleted, or the backend might be offline"); 
    }).finally(() => {
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  async function saveEdits() {
    if (!recipe) return;
    if (!title.trim()) return Alert.alert("Title required");
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);

    const ingredients = textToList(ingredientsText);
    const steps = textToList(stepsText);

    try {
      const updated = await requestJson(`/api/v1/recipes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...recipe,
          title: title.trim(),
          description: description.trim() || null,
          ingredients,
          steps,
          instructions: steps.join("\n\n"),
          image_path: recipe.image_path ?? null,
        }),
      });

      const parsed = tryParse(RecipeSchema, updated);
      setRecipe(parsed);
      setIsEditing(false);
      feedback("success");
      Alert.alert("Saved", "Recipe updated.");
    } catch (e: any) {
      feedback("error");
      Alert.alert("Save error", String(e?.message || e));
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function pickAndUploadPhoto() {
    if (!id || mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (res.canceled || !res.assets[0]) return;
      const updated = await requestJson<Recipe>(`/api/v1/recipes/${id}/photo`, {
        method: "POST", body: await photoForm(res.assets[0]),
      });
      const parsed = tryParse(RecipeSchema, updated);

      setRecipe(parsed);
      setPhotoUri(updated.image_path ? `${BASE}${updated.image_path}` : "");

      feedback("success");
      Alert.alert("Photo added", "Recipe photo updated.");
    } catch (e: any) {
      feedback("error");
      Alert.alert("Photo upload error", String(e?.message || e));
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function deleteRecipe() {
    Alert.alert(
      "Delete recipe?",
      "This will remove the recipe from Kitchain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (mutationLock.current) return;
            mutationLock.current = true;
            setBusy(true);
            try {
              await requestJson(`/api/v1/recipes/${id}`, {
                method: "DELETE",
              });

              feedback("success");
              Alert.alert("Deleted", "Recipe removed.");
              router.back();
            } catch (e: any) {
              feedback("error");
              Alert.alert("Delete error", String(e?.message || e));
            } finally {
              mutationLock.current = false;
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  function cancelEdits() {
    if (!recipe || mutationLock.current) return;
    setTitle(recipe.title);
    setDescription(recipe.description || "");
    setIngredientsText(listToText(recipe.ingredients));
    setStepsText(listToText(recipe.steps));
    setIsEditing(false);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>Loading recipe…</Text>
        <Text style={{ color: "#666", marginTop: 6 }}>Opening the recipe card.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12 }}>
        <View style={{ backgroundColor: "#fef2f2", padding: 12, borderRadius: 10 }}>
          <Text style={{ color: "#991b1b", fontWeight: "600" }}>Recipe error</Text>
          <Text style={{ color: "#7f1d1d", marginTop: 4 }}>{error}</Text>
        </View>

        <Pressable
          onPress={() => {
            setLoading(true);
            setError("");
            void loadRecipe();
          }}
          style={{ backgroundColor: "#1e73ff", padding: 14, borderRadius: 10 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>Try Again</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={{ backgroundColor: "#eee", padding: 14, borderRadius: 10 }}
        >
          <Text style={{ textAlign: "center", fontWeight: "600" }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <Text>Recipe not found.</Text>
      </View>
    );
  }

  if (isEditing) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 240 }}
        >
          <Text style={{ fontSize: 24, fontWeight: "700" }}>Edit Recipe</Text>

        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: "100%", height: 220, borderRadius: 12 }} />
        ) : null}

        <Pressable
          onPress={pickAndUploadPhoto}
          disabled={busy}
          style={{ backgroundColor: "#eee", padding: 14, borderRadius: 10 }}
        >
          <Text style={{ textAlign: "center", fontWeight: "600" }}>
            {photoUri ? "Replace Recipe Photo" : "Add Recipe Photo"}
          </Text>
        </Pressable>

        <Text style={{ fontWeight: "600" }}>Title</Text>
        <TextInput
          editable={!busy}
          value={title}
          onChangeText={setTitle}
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 }}
        />

        <Text style={{ fontWeight: "600" }}>Description</Text>
        <TextInput
          editable={!busy}
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, minHeight: 70 }}
        />

        <Text style={{ fontWeight: "600" }}>Ingredients</Text>
        <TextInput
          editable={!busy}
          value={ingredientsText}
          onChangeText={setIngredientsText}
          multiline
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, minHeight: 130 }}
        />

        <Text style={{ fontWeight: "600" }}>Steps / Notes</Text>
        <TextInput
          editable={!busy}
          value={stepsText}
          onChangeText={setStepsText}
          multiline
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, minHeight: 160 }}
        />

        <Pressable
          onPress={saveEdits}
          disabled={busy}
          style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 10 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>{busy ? "Working…" : "Save Changes"}</Text>
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={cancelEdits}
          style={{ backgroundColor: "#eee", padding: 14, borderRadius: 10 }}
        >
          <Text style={{ textAlign: "center", fontWeight: "600" }}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const ingredients = textToList(listToText(recipe.ingredients));
  const allSteps = textToList(listToText(recipe.steps));

  const steps = allSteps.filter((step) => !step.toLowerCase().startsWith("note:"));
  const notes = allSteps
    .filter((step) => step.toLowerCase().startsWith("note:"))
    .map((note) => note.replace(/^note:\s*/i, ""));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>{recipe.title}</Text>
      {recipe.description ? <Text style={{ color: "#444" }}>{recipe.description}</Text> : null}

      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: "100%", height: 240, borderRadius: 12 }} />
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => setIsEditing(true)}
          disabled={busy}
          style={{ backgroundColor: "#1e73ff", padding: 12, borderRadius: 10, flex: 1 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>Edit</Text>
        </Pressable>

        <Pressable
          onPress={deleteRecipe}
          disabled={busy}
          haptic="warning"
          style={{ backgroundColor: "#dc2626", padding: 12, borderRadius: 10, flex: 1 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>Delete</Text>
        </Pressable>
      </View>

      {ingredients.length > 0 ? (
        <View>
          <Text style={{ fontWeight: "600", marginTop: 8 }}>Ingredients</Text>
          {ingredients.map((it, i) => (
            <Text key={i}>• {it}</Text>
          ))}
        </View>
      ) : null}

      {steps.length > 0 ? (
        <View>
          <Text style={{ fontWeight: "600", marginTop: 8 }}>Steps</Text>
          {steps.map((step, i) => (
            <Text key={i}>{i + 1}. {step}</Text>
          ))}
        </View>
      ) : null}

      {notes.length > 0 ? (
        <View>
          <Text style={{ fontWeight: "600", marginTop: 8 }}>Notes / Optional Add-ins</Text>
          {notes.map((note, i) => (
            <Text key={i}>• {note}</Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
