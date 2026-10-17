import { useCallback, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { KitchenButton, KitchenHeading, KitchenNotice, KitchenScroll, KitchenText, PixelFrame, useKitchenDialog } from "@/components/kitchen";
import { NutritionSummary } from "@/components/NutritionPanel";
import { discoveryApi } from "@/lib/api";
import type { PublicRecipe } from "@/lib/discovery-types";
import { feedback } from "@/lib/haptics";

export default function PublicDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PublicDetailContent key={id} id={id} />;
}

function PublicDetailContent({ id }: { id: string }) {
  const dialog = useKitchenDialog();
  const [recipe, setRecipe] = useState<PublicRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooked, setCooked] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try { const found = await discoveryApi.getPublic(id); if (current === generation.current) { setRecipe(found); setStars(found.my_rating); setCooked(!!found.my_rating); } }
    catch (e: any) { if (current === generation.current) setError(e.message); }
    finally { if (current === generation.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));

  async function mutate(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await action(); feedback("success"); }
    catch (e: any) { setError(e.message); feedback("error"); }
    finally { lock.current = false; setBusy(false); }
  }

  return <KitchenScroll>
    {loading && <KitchenNotice>Opening this public recipe…</KitchenNotice>}
    {!!error && <KitchenNotice kind="error">{error}</KitchenNotice>}
    {!loading && !recipe && <KitchenButton onPress={load}>Try again</KitchenButton>}
    {recipe && <>
      <PixelFrame ornate contentStyle={{ padding: 24, gap: 16 }}>
        <KitchenHeading subtitle={`From ${recipe.source_name}${recipe.source_author ? ` · ${recipe.source_author}` : ""}`}>{recipe.title}</KitchenHeading>
        <KitchenText>{recipe.rating_count ? `${recipe.rating_average} / 5 · ${recipe.rating_count} KitChain cook rating(s)` : "No KitChain cook ratings yet."}</KitchenText>
        {!!recipe.source_url && <KitchenButton variant="butter" onPress={() => void Linking.openURL(recipe.source_url!)}>Read original recipe</KitchenButton>}
        {!!recipe.license_url && <><KitchenText>Recipe text reused under the source’s stated license. Source credit and license also apply to copies.</KitchenText><KitchenButton compact onPress={() => void Linking.openURL(recipe.license_url!)}>View recipe license</KitchenButton></>}
        {recipe.reuse_status === "contributed" && <KitchenText>Shared by {recipe.source_name}. This is a snapshot of the recipe they chose to publish.</KitchenText>}
        {recipe.total_minutes !== null && <KitchenText>{recipe.total_minutes} minutes</KitchenText>}
        {recipe.servings !== null && <KitchenText>Makes {recipe.servings} serving(s)</KitchenText>}
        {recipe.reuse_status === "link_only" ? <KitchenNotice>The full instructions live on the publisher’s website. This source card lets you find it again, see nutrition estimates, and rate it after cooking.</KitchenNotice> : <>
          <KitchenHeading>Ingredients</KitchenHeading>
          {recipe.ingredients.map((line, i) => <KitchenText key={i}>▪ {line}</KitchenText>)}
          <KitchenHeading>Directions</KitchenHeading>
          {recipe.steps.map((step, i) => <KitchenText key={i}>{i + 1}. {step}</KitchenText>)}
        </>}
      </PixelFrame>
      {recipe.nutrition?.source && <NutritionSummary data={recipe.nutrition} />}
      {recipe.can_copy && <KitchenButton variant="primary" disabled={busy} onPress={() => void mutate(async () => { const saved = await discoveryApi.copy(id); router.push(`/(recipes)/${saved.id}`); })}>{busy ? "Working…" : "Keep a copy in my collection"}</KitchenButton>}
      <PixelFrame contentStyle={{ padding: 20, gap: 14 }}>
        <KitchenHeading subtitle="Tell other cooks how it went.">Made this recipe?</KitchenHeading>
        <KitchenButton accessibilityRole="checkbox" accessibilityState={{ checked: cooked }} variant={cooked ? "primary" : "neutral"} disabled={busy} onPress={() => setCooked(!cooked)}>{`${cooked ? "✓ " : ""}I cooked this recipe`}</KitchenButton>
        <View accessibilityRole="radiogroup" accessibilityLabel="Recipe rating" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[1, 2, 3, 4, 5].map(value => <KitchenButton key={value} compact accessibilityRole="radio" accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`} accessibilityState={{ selected: stars === value, checked: stars === value }} variant={stars && value <= stars ? "butter" : "neutral"} disabled={busy || !cooked} onPress={() => setStars(value)}>{"★"}</KitchenButton>)}
        </View>
        <KitchenButton variant="primary" disabled={busy || !cooked || !stars} onPress={() => void mutate(async () => { setRecipe(await discoveryApi.rate(id, stars!)); })}>{recipe.my_rating ? "Update my rating" : "Save my rating"}</KitchenButton>
        <KitchenText>One rating per local cook profile. Updating your rating replaces your earlier score.</KitchenText>
        {!!recipe.my_rating && <KitchenButton disabled={busy} onPress={() => void mutate(async () => { await discoveryApi.removeRating(id); const updated = await discoveryApi.getPublic(id); setRecipe(updated); setStars(null); setCooked(false); })}>Remove my rating</KitchenButton>}
      </PixelFrame>
      {recipe.can_remove && <KitchenButton variant="danger" disabled={busy} onPress={() => dialog.alert("Remove public recipe?", "Your family recipe stays in your collection. This public copy and its cook ratings will be removed.", [{ text: "Cancel", style: "cancel" }, { text: "Remove public copy", style: "destructive", onPress: () => void mutate(async () => { await discoveryApi.unpublish(id); router.replace("/public"); }) }])}>Remove my public recipe</KitchenButton>}
    </>}
  </KitchenScroll>;
}
