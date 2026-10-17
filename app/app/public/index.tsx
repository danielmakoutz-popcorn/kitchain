import { useCallback, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { Link, router, useFocusEffect } from "expo-router";
import { KitchenButton, KitchenHeading, KitchenInput, KitchenNotice, KitchenScroll, KitchenText, PixelFrame } from "@/components/kitchen";
import { discoveryApi } from "@/lib/api";
import type { PublicRecipe } from "@/lib/discovery-types";

export default function PublicCollection() {
  const [recipes, setRecipes] = useState<PublicRecipe[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [order, setOrder] = useState<"newest" | "rating">("newest");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const [more, setMore] = useState(false);
  const sequence = useRef(0);
  const importLock = useRef(false);

  const load = useCallback(async (offset = 0) => {
    const current = ++sequence.current;
    setBusy(true); setError("");
    try {
      const found = await discoveryApi.listPublic(appliedQuery, order, offset);
      if (current === sequence.current) { setRecipes(previous => offset ? [...previous, ...found] : found); setMore(found.length === 50); }
    } catch (e: any) { if (current === sequence.current) setError(e.message); }
    finally { if (current === sequence.current) setBusy(false); }
  }, [appliedQuery, order]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));

  async function importRecipe() {
    if (importLock.current || !url.trim()) return;
    if (!/^https?:\/\//i.test(url.trim())) return setError("Paste the full http:// or https:// recipe address.");
    importLock.current = true; setImporting(true); setImportError("");
    try { const recipe = await discoveryApi.importLink(url.trim()); setUrl(""); router.push(`/public/${recipe.id}`); }
    catch (e: any) { setImportError(e.message); }
    finally { importLock.current = false; setImporting(false); }
  }

  return <KitchenScroll>
    <KitchenHeading subtitle="Published finds and recipes shared by your cooks.">The public recipe table</KitchenHeading>
    <KitchenText>Family recipes stay in your collection until you choose to share them. Web finds keep credit and a link to the original.</KitchenText>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      <Link href="/(recipes)" asChild><KitchenButton compact>Family collection</KitchenButton></Link>
      <Link href={{ pathname: "/discover", params: { mode: "public" } }} asChild><KitchenButton compact variant="primary">Find something to cook</KitchenButton></Link>
    </View>
    <KitchenInput label="Search public recipes" value={query} onChangeText={setQuery} placeholder="Search recipe titles" maxLength={120} onSubmitEditing={() => query.trim() === appliedQuery ? void load() : setAppliedQuery(query.trim())} />
    <KitchenButton disabled={busy} onPress={() => query.trim() === appliedQuery ? void load() : setAppliedQuery(query.trim())}>Search public collection</KitchenButton>
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {([['newest', 'Newest finds'], ['rating', 'Highest rated']] as const).map(([value, label]) => <KitchenButton key={value} compact accessibilityRole="radio" accessibilityState={{ selected: order === value }} variant={order === value ? "primary" : "neutral"} onPress={() => setOrder(value)}>{label}</KitchenButton>)}
    </View>
    {!!error && <KitchenNotice kind="error">{error}</KitchenNotice>}
    {busy && <KitchenNotice>Opening the public recipe table…</KitchenNotice>}
    {!busy && !recipes.length && <KitchenNotice title="Room for a new favorite">Find a recipe through recommendations, paste a published recipe link below, or share one of your own recipes.</KitchenNotice>}
    {recipes.map(recipe => <PixelFrame key={recipe.id} ornate contentStyle={{ padding: 20, gap: 12 }}>
      <KitchenHeading subtitle={`${recipe.source_name}${recipe.source_author ? ` · ${recipe.source_author}` : ""}`}>{recipe.title}</KitchenHeading>
      <KitchenText>{recipe.rating_count ? `${recipe.rating_average} / 5 · ${recipe.rating_count} KitChain cook rating(s)` : "No KitChain cook ratings yet"}</KitchenText>
      <KitchenText>{recipe.reuse_status === "link_only" ? "Read the full recipe at its original source." : "Full recipe available here."}</KitchenText>
      <KitchenButton variant="butter" onPress={() => router.push(`/public/${recipe.id}`)}>{`Open ${recipe.title}`}</KitchenButton>
    </PixelFrame>)}
    {more && <KitchenButton disabled={busy} onPress={() => void load(recipes.length)}>Load more recipes</KitchenButton>}
    <PixelFrame contentStyle={{ padding: 20, gap: 14 }}>
      <KitchenHeading>Bring a recipe link</KitchenHeading>
      <KitchenText>This adds a public source card. Full instructions are kept here when the source permits reuse.</KitchenText>
      <KitchenInput label="Published recipe URL" value={url} onChangeText={setUrl} editable={!importing} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={2048} placeholder="https://…" />
      <KitchenButton variant="primary" disabled={importing || !url.trim()} onPress={importRecipe}>{importing ? "Reading recipe page…" : "Add recipe from link"}</KitchenButton>
      {!!importError && <KitchenNotice kind="error" title="This recipe could not be imported">{importError}</KitchenNotice>}
      {!!importError && <>
        <KitchenText>Some websites block automatic reading or use a format KitChain cannot read. Open the original recipe in your browser, try a link from another publisher, or enter its ingredients and your own cooking notes in a family recipe.</KitchenText>
        {/^https?:\/\//i.test(url.trim()) && <KitchenButton onPress={() => void Linking.openURL(url.trim())}>Open original website</KitchenButton>}
        <Link href="/(recipes)/AddRecipe" asChild><KitchenButton>Write a family recipe manually</KitchenButton></Link>
        <Link href={{ pathname: "/discover", params: { mode: "public" } }} asChild><KitchenButton>Find a recipe from another source</KitchenButton></Link>
      </>}
    </PixelFrame>
  </KitchenScroll>;
}
