import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, Linking, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { KitchenButton, KitchenHeading, KitchenInput, KitchenNotice, KitchenScroll, KitchenText, PixelFrame } from "@/components/kitchen";
import { NutritionSummary } from "@/components/NutritionPanel";
import { discoveryApi } from "@/lib/api";
import { usePantry } from "@/hooks/use-pantry";
import { ingredientList } from "@/lib/pantry";
import type { RecommendationResult, SearchUsage } from "@/lib/discovery-types";
import { feedback } from "@/lib/haptics";

const subscribeToHydration = () => () => {};

export default function Discover() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [query, setQuery] = useState("");
  const pantry = usePantry();
  const [excluded, setExcluded] = useState("");
  const [minutes, setMinutes] = useState("");
  const [protein, setProtein] = useState("");
  const [calories, setCalories] = useState("");
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [modeChoice, setModeChoice] = useState<{ route: string | undefined; choice: "family" | "public" } | null>(null);
  const mode = modeChoice && modeChoice.route === params.mode ? modeChoice.choice : hydrated && params.mode === "public" ? "public" : "family";
  const [allowWeb, setAllowWeb] = useState(true);
  const [usage, setUsage] = useState<SearchUsage | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    discoveryApi.status().then(value => { if (active) setUsage(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function submit() {
    if (lock.current) return;
    if (query.trim().length < 2) return setError("Tell us what you feel like cooking.");
    const fields = [[minutes, "Maximum minutes", false], [protein, "Minimum protein", true], [calories, "Maximum calories", false]] as const;
    const values: (number | undefined)[] = [];
    for (const [text, label, zero] of fields) {
      const number = Number(text.replace(",", "."));
      if (text.trim() && (!Number.isFinite(number) || (zero ? number < 0 : number <= 0))) return setError(`${label} needs a ${zero ? "nonnegative" : "positive"} number.`);
      values.push(text.trim() ? number : undefined);
    }
    lock.current = true; setBusy(true); setError(""); setResult(null); Keyboard.dismiss();
    try {
      if (pantry.dirty && !await pantry.save()) return;
      const response = await discoveryApi.recommend({ query: query.trim(), pantry: ingredientList(pantry.text), excluded: ingredientList(excluded), max_minutes: values[0], min_protein: values[1], max_calories: values[2], mode, allow_web: allowWeb });
      setResult(response); setUsage(response.usage); feedback("success");
    } catch (e: any) { setError(e.message); feedback("error"); }
    finally { lock.current = false; setBusy(false); }
  }

  return <KitchenScroll>
    <KitchenHeading subtitle="Find a real recipe that fits tonight.">What should we cook?</KitchenHeading>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      <Link href="/(recipes)" asChild><KitchenButton compact>Family collection</KitchenButton></Link>
      <Link href="/public" asChild><KitchenButton compact variant="butter">Public collection</KitchenButton></Link>
    </View>
    <PixelFrame ornate contentStyle={{ padding: 20, gap: 14 }}>
      <KitchenInput label="What sounds good?" placeholder="A chicken and rice dinner, something spicy…" multiline value={query} maxLength={500} editable={!busy} onChangeText={setQuery} />
      <KitchenInput label="Ingredients I have · comma or line separated" placeholder="Chicken, rice, broccoli" multiline value={pantry.text} editable={pantry.ready && !busy} onChangeText={pantry.edit} maxLength={8100} />
      <KitchenText>Your saved pantry fills this list. Edits are saved when you find recipe ideas. Amounts and freshness still need checking.</KitchenText>
      <Link href="/pantry" asChild><KitchenButton compact>Open my pantry</KitchenButton></Link>
      {!!pantry.error && <KitchenNotice kind="error">{pantry.error}</KitchenNotice>}
      {!pantry.ready && <KitchenButton compact onPress={() => void pantry.reload()}>Retry opening pantry</KitchenButton>}
      <KitchenInput label="Exclude ingredients · comma separated" placeholder="Peanuts, dairy" value={excluded} editable={!busy} onChangeText={setExcluded} />
      <KitchenInput label="Maximum cooking time · minutes" keyboardType="decimal-pad" value={minutes} editable={!busy} onChangeText={setMinutes} placeholder="Optional" />
      <KitchenInput label="Minimum protein per serving · grams" keyboardType="decimal-pad" value={protein} editable={!busy} onChangeText={setProtein} placeholder="Optional" />
      <KitchenInput label="Maximum calories per serving · kcal" keyboardType="decimal-pad" value={calories} editable={!busy} onChangeText={setCalories} placeholder="Optional" />
      <KitchenText>Recipes need known times or complete nutrition estimates to meet those limits.</KitchenText>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {([['family', 'Family + public recipes'], ['public', 'Public recipes only']] as const).map(([value, label]) => <KitchenButton key={value} compact accessibilityRole="radio" accessibilityState={{ selected: mode === value, checked: mode === value }} variant={mode === value ? "primary" : "neutral"} disabled={busy} onPress={() => setModeChoice({ route: params.mode, choice: value })}>{label}</KitchenButton>)}
      </View>
      <KitchenButton accessibilityRole="checkbox" accessibilityState={{ checked: allowWeb }} disabled={busy} variant={allowWeb ? "primary" : "neutral"} onPress={() => setAllowWeb(!allowWeb)}>{`${allowWeb ? "✓ " : ""}Search the web when saved recipes lack a good match`}</KitchenButton>
      {!!usage && <KitchenText>{usage.configured ? `${Math.max(0, usage.monthly_limit - usage.monthly_used)} shared web searches left this month.` : "Web search is not set up yet. Your saved collection still works."}</KitchenText>}
      <KitchenButton variant="primary" disabled={busy || !pantry.ready} onPress={submit}>{busy ? "Comparing recipes…" : "Find three recipe ideas"}</KitchenButton>
    </PixelFrame>
    {!!error && <KitchenNotice kind="error">{error}</KitchenNotice>}
    {busy && <KitchenNotice>Checking saved recipes first. If needed, we’ll look for published recipes and read their source pages. This can take a moment.</KitchenNotice>}
    {result && <>
      {result.warnings.map((warning, i) => <KitchenNotice key={i}>{warning}</KitchenNotice>)}
      {!result.choices.length && <KitchenNotice title={result.unread_sources?.length ? "Recipe websites could not be imported" : "No reliable match yet"}>{result.unread_sources?.length ? "The search returned links, but their recipe details could not be verified. Open an original website below, try another publisher, or enter a recipe manually." : "Try fewer restrictions or different ingredients. We’ll leave the list empty when the available recipes don’t meet your request."}</KitchenNotice>}
      {!!result.unread_sources?.length && <PixelFrame contentStyle={{ padding: 20, gap: 14 }}>
        <KitchenHeading>Original websites to try</KitchenHeading>
        <KitchenText>These search links are unverified. Check the original recipe yourself; they have not been added to the public recipe table.</KitchenText>
        {result.unread_sources.map(source => <View key={source.url} style={{ gap: 8 }}>
          <KitchenText style={{ fontWeight: "700" }}>{source.title}</KitchenText>
          <KitchenText>{source.reason}</KitchenText>
          <KitchenButton accessibilityLabel={`Open source website: ${source.title}`} onPress={() => void Linking.openURL(source.url)}>Open original website</KitchenButton>
        </View>)}
      </PixelFrame>}
      {result.choices.map((choice, i) => <PixelFrame key={choice.key} ornate contentStyle={{ padding: 20, gap: 14 }}>
        <KitchenHeading subtitle={`Choice ${i + 1} · ${choice.source_name}${choice.source_author ? ` · ${choice.source_author}` : ""}`}>{choice.title}</KitchenHeading>
        {choice.reasons.map(reason => <KitchenText key={reason}>{reason}</KitchenText>)}
        {choice.total_minutes !== null && <KitchenText>{choice.total_minutes} minutes</KitchenText>}
        {!!pantry.text.trim() && <KitchenText>{choice.missing_ingredients.length ? `Still needed: ${choice.missing_ingredients.join(", ")}` : "Your ingredient list covers the recorded ingredients. Check quantities."}</KitchenText>}
        {choice.nutrition?.source && <NutritionSummary data={choice.nutrition} />}
        <KitchenText>{choice.rating_count ? `${choice.rating_average} / 5 from ${choice.rating_count} KitChain cook rating(s)` : "No KitChain cook ratings yet."}</KitchenText>
        <KitchenButton accessibilityLabel={`Open recipe: ${choice.title}`} variant="butter" onPress={() => router.push(choice.kind === "family" ? `/(recipes)/${choice.id}` : `/public/${choice.id}`)}>Open recipe</KitchenButton>
        {!!choice.source_url && <KitchenButton onPress={() => void Linking.openURL(choice.source_url!)}>Read original source</KitchenButton>}
      </PixelFrame>)}
      <KitchenNotice>{result.notice}</KitchenNotice>
    </>}
  </KitchenScroll>;
}
