import { useCallback, useEffect, useRef, useState } from "react";
import { View, Image, Linking } from "react-native";
import { kitchen as c, kitchenFonts } from "@/constants/kitchen";
import { KitchenButton, KitchenHeading, KitchenInput, KitchenNotice, KitchenScroll, KitchenText as Text, PixelFrame, PixelIcon, Flourish, useKitchenDialog } from "@/components/kitchen";
import { feedback } from "@/lib/haptics";
import { photoForm } from "@/lib/photos";
import { useLocalSearchParams, router } from "expo-router";
import { api, API_BASE as BASE, discoveryApi, requestJson, tryParse } from "../../lib/api";
import { Recipe, RecipeSchema } from "../../lib/types";
import * as ImagePicker from "expo-image-picker";
import { NutritionPanel } from "@/components/NutritionPanel";
import type { Nutrition } from "@/lib/discovery-types";

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
  const Alert = useKitchenDialog();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [source, setSource] = useState<Nutrition["provenance"]>(null);
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
    let active = true;
    discoveryApi.recipeSource(id).then(value => { if (active) setSource(value); }).catch(() => {});
    return () => { active = false; };
  }, [id, loadRecipe]);

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

  function publishRecipe() {
    Alert.alert("Share your recipe publicly?", "Only share recipes you created or own the rights to share. This publishes the title, ingredients and directions to the public recipe table. Your original photo and writer profile stay in the family collection.", [
      { text: "Cancel", style: "cancel" },
      { text: "I own this recipe · share it", onPress: async () => {
        if (mutationLock.current) return;
        mutationLock.current = true; setBusy(true);
        try { const shared = await discoveryApi.publish(id); feedback("success"); router.push(`/public/${shared.id}`); }
        catch (e: any) { feedback("error"); Alert.alert("Could not share recipe", e.message); }
        finally { mutationLock.current = false; setBusy(false); }
      } },
    ]);
  }

  if (loading) return <KitchenScroll contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}><KitchenNotice title="Opening the recipe card…">Your recipe will be ready in a moment.</KitchenNotice></KitchenScroll>;
  if (error) return <KitchenScroll contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
    <KitchenNotice kind="error" title="Could not open this recipe">{error}</KitchenNotice>
    <KitchenButton variant="primary" onPress={() => { setLoading(true); setError(""); void loadRecipe(); }}>Try again</KitchenButton>
    <KitchenButton icon="back" onPress={() => router.back()}>Back</KitchenButton>
  </KitchenScroll>;
  if (!recipe) return <KitchenScroll><KitchenNotice>Recipe not found.</KitchenNotice></KitchenScroll>;
  if (isEditing) return <KitchenScroll contentContainerStyle={{ paddingBottom: 80 }}>
      <KitchenHeading>Make it your own</KitchenHeading>
      <PixelFrame ornate contentStyle={{ padding: 24, gap: 16 }}>
        {photoUri ? <Image source={{ uri: photoUri }} accessibilityLabel="Recipe photo" resizeMode="contain" style={{ width: "100%", height: 220, backgroundColor: c.ivory }} /> : null}
        <KitchenButton onPress={pickAndUploadPhoto} disabled={busy} icon="plus">{photoUri ? "Replace recipe photo" : "Add recipe photo"}</KitchenButton>
        <KitchenInput label="Title" editable={!busy} value={title} onChangeText={setTitle} />
        <KitchenInput label="Description" editable={!busy} value={description} onChangeText={setDescription} multiline />
        <KitchenInput label="Ingredients · one per line" editable={!busy} value={ingredientsText} onChangeText={setIngredientsText} multiline style={{ minHeight: 130 }} />
        <KitchenInput label="Directions / notes" editable={!busy} value={stepsText} onChangeText={setStepsText} multiline style={{ minHeight: 160 }} />
        <KitchenButton onPress={saveEdits} disabled={busy} variant="primary" icon="save">{busy ? "Working…" : "Save changes"}</KitchenButton>
        <KitchenButton disabled={busy} onPress={cancelEdits}>Cancel</KitchenButton>
      </PixelFrame>
    </KitchenScroll>;

  const ingredients = textToList(listToText(recipe.ingredients));
  const allSteps = textToList(listToText(recipe.steps));
  const steps = allSteps.filter(step => !step.toLowerCase().startsWith("note:"));
  const notes = allSteps.filter(step => step.toLowerCase().startsWith("note:")).map(note => note.replace(/^note:\s*/i, ""));
  return <KitchenScroll>
    <PixelFrame ornate contentStyle={{ padding: 26, gap: 18 }}>
      <View style={{ alignItems: "center" }}><PixelIcon name="herb" color={c.greenShade} size={28} /></View>
      <Text accessibilityRole="header" style={{ fontFamily: kitchenFonts.heading, fontSize: 30, lineHeight: 38, fontWeight: "700", textAlign: "center" }}>{recipe.title}</Text>
      {!!recipe.description && <Text style={{ color: c.muted, textAlign: "center" }}>{recipe.description}</Text>}
      {!!source?.source_name && <KitchenNotice title="Original recipe credit">
        <Text>{source.source_name}{source.source_author ? ` · ${source.source_author}` : ""}</Text>
        {!!source.source_url && <KitchenButton compact onPress={() => void Linking.openURL(source.source_url!)}>Open original recipe source</KitchenButton>}
        {!!source.license_url && <KitchenButton compact onPress={() => void Linking.openURL(source.license_url!)}>View original recipe license</KitchenButton>}
      </KitchenNotice>}
      <Flourish />
      {photoUri ? <View style={{ borderColor: c.border, borderWidth: 1, padding: 5, backgroundColor: c.ivory }}><Image source={{ uri: photoUri }} accessibilityLabel={`Photo of ${recipe.title}`} resizeMode="contain" style={{ width: "100%", height: 240 }} /></View> : null}
      {ingredients.length > 0 && <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={{ fontFamily: kitchenFonts.heading, fontSize: 22, lineHeight: 30, fontWeight: "700" }}>Ingredients</Text>
        {ingredients.map((ingredient, index) => <View key={index} style={{ flexDirection: "row", gap: 10 }}><Text style={{ color: c.greenInk }}>▪</Text><Text style={{ flex: 1 }}>{ingredient}</Text></View>)}
      </View>}
      {steps.length > 0 && <View style={{ gap: 14 }}>
        <Flourish />
        <Text accessibilityRole="header" style={{ fontFamily: kitchenFonts.heading, fontSize: 22, lineHeight: 30, fontWeight: "700" }}>Directions</Text>
        {steps.map((step, index) => <View key={index} style={{ flexDirection: "row", gap: 12 }}><Text style={{ color: c.greenInk, fontWeight: "700", minWidth: 22 }}>{index + 1}.</Text><Text style={{ flex: 1 }}>{step}</Text></View>)}
      </View>}
      {notes.length > 0 && <KitchenNotice title="Notes / optional add-ins">{notes.map((note, index) => <Text key={index}>{note}</Text>)}</KitchenNotice>}
      <Flourish />
    </PixelFrame>
    <NutritionPanel key={JSON.stringify(recipe.ingredients)} recipeId={id} />
    <KitchenButton disabled={busy} icon="book" onPress={publishRecipe}>Share my own recipe publicly</KitchenButton>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      <KitchenButton onPress={() => setIsEditing(true)} disabled={busy} variant="butter" icon="edit" style={{ flexGrow: 1 }}>Edit recipe</KitchenButton>
      <KitchenButton onPress={deleteRecipe} disabled={busy} variant="danger" haptic="warning" icon="delete" style={{ flexGrow: 1 }}>Delete</KitchenButton>
    </View>
  </KitchenScroll>;
}
