import { useCallback, useMemo, useState } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { ArtSlot } from "@/components/ArtSlot";
import { kitchen as c } from "@/constants/kitchen";
import { KitchenButton, KitchenHeading, KitchenNotice, KitchenScreen, KitchenSearch, KitchenText as Text, PixelIcon } from "@/components/kitchen";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { api, API_BASE as BASE, tryParse } from "../../lib/api";
import { Recipe, RecipeSchema } from "../../lib/types";
import { RecipeCard } from "../../components/RecipeCard";
import { findRecipes, type RecipeOrder } from "@/lib/recipe-search";

export default function RecipeList() {
  const [data, setData] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<RecipeOrder>("newest");
  const matches = useMemo(() => findRecipes(data, query, order), [data, query, order]);
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError("");

    try {
      const raw = await api.listRecipes();
      const list: Recipe[] = (raw || []).map((r: any) => tryParse(RecipeSchema, r));
      setData(list);
    } catch (e: any) {
      console.warn("listRecipes error", e);
      setError("Could not load recipes, Make sure the backend is running");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Automatically reload recipes when you navigate back to this screen
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const header = <View style={{ gap: 14, paddingTop: 12, paddingBottom: 18 }}>
    <KitchenHeading subtitle="Family favorites, all in one place.">Your recipe collection</KitchenHeading>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      <Link href="/(recipes)/AddFromPhoto" asChild><KitchenButton compact variant="primary" icon="scan">Add from photo</KitchenButton></Link>
      <Link href="/(recipes)/AddRecipe" asChild><KitchenButton compact variant="butter" icon="plus">Write a recipe</KitchenButton></Link>
      <Link href="/discover" asChild><KitchenButton compact icon="search">Find something to cook</KitchenButton></Link>
      <Link href="/public" asChild><KitchenButton compact icon="book">Public recipes</KitchenButton></Link>
    </View>
    <KitchenSearch value={query} onChangeText={setQuery} />
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {([['newest', 'Newest'], ['oldest', 'Oldest'], ['title', 'A–Z']] as const).map(([value, label]) => <KitchenButton compact key={value} haptic="selection" variant={order === value ? "primary" : "neutral"} accessibilityRole="radio" accessibilityState={{ selected: order === value }} onPress={() => setOrder(value)}>{label}</KitchenButton>)}
    </View>
    {!loading && !error && <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 14 }}>{matches.length} of {data.length} recipes</Text>}
    {!!error && <KitchenNotice kind="error" title="Could not open your collection"><Text>{error}</Text><KitchenButton onPress={load} compact>Try again</KitchenButton></KitchenNotice>}
    {loading && data.length === 0 && <KitchenNotice>Opening your recipe cards…</KitchenNotice>}
  </View>;
  return <KitchenScreen>
    <FlatList data={matches} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center", paddingBottom: 40 }}
      ListHeaderComponent={header} keyExtractor={item => String(item.id)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={c.greenInk} colors={[c.greenInk]} />}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      renderItem={({ item }) => <RecipeCard title={item.title} subtitle={item.description} imageUrl={item.image_path ? `${BASE}${item.image_path}` : undefined} onPress={() => router.push(`/(recipes)/${item.id}`)} />}
      ListEmptyComponent={!loading && !error ? <KitchenNotice title={query.trim() && data.length ? "Nothing here just yet" : "Start your collection"}>
        <View style={{ alignItems: "center", padding: 12 }}><ArtSlot name="collectionEmpty" fallback={<PixelIcon name="book" size={44} color={c.border} />} /></View>
        <Text>{query.trim() && data.length ? "No matching recipes. Try another name or ingredient." : "Add your first recipe from a photo, or write one by hand."}</Text>
      </KitchenNotice> : null}
      ListFooterComponent={<Text style={{ color: c.muted, fontSize: 13, textAlign: "center", marginTop: 24 }}>Always review AI-read names, amounts, and cooking times.</Text>}
    />
  </KitchenScreen>;
}
