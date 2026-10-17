import { useRef, useState } from "react";
import { KitchenButton, KitchenHeading, KitchenInput, KitchenScroll, PixelFrame, useKitchenDialog } from "@/components/kitchen";
import { feedback } from "@/lib/haptics";
import { api } from "../../lib/api";
import { useRouter } from "expo-router";

export default function AddRecipe() {
  const Alert = useKitchenDialog();
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

  return <KitchenScroll>
    <KitchenHeading subtitle="Write it down. Keep it close.">A new recipe</KitchenHeading>
    <PixelFrame ornate contentStyle={{ padding: 24, gap: 16 }}>
      <KitchenInput label="Recipe title" editable={!saving} placeholder="What are we making?" value={title} onChangeText={setTitle} />
      <KitchenInput label="A little about it" editable={!saving} placeholder="A family favorite, a new discovery…" value={description} onChangeText={setDesc} />
      <KitchenInput label="Ingredients · one per line" editable={!saving} multiline value={ingredients} onChangeText={setIngredients} placeholder="2 cups flour" />
      <KitchenInput label="Directions · one step per line" editable={!saving} multiline value={steps} onChangeText={setSteps} placeholder="Start with…" style={{ minHeight: 150 }} />
      <KitchenButton onPress={submit} disabled={saving} variant="primary" icon="save">{saving ? "Saving…" : "Save recipe"}</KitchenButton>
    </PixelFrame>
  </KitchenScroll>;
}
