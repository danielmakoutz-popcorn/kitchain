import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, RefreshControl } from "react-native";
import { HapticPressable as Pressable } from "@/components/HapticPressable";
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

  return (
    <View style={{ flex:1, padding:16 }}>
      <View style={{ flexDirection:"row", gap:12, marginBottom:12 }}>
        <Link href="/(recipes)/AddRecipe" asChild><Pressable><Text style={{ color:"#1e73ff", fontSize:16 }}>+ Add Recipe</Text></Pressable></Link>
        <Link href="/(recipes)/AddFromPhoto" asChild><Pressable><Text style={{ color:"#1e73ff", fontSize:16 }}>+ Add from Photo</Text></Pressable></Link>
      </View>
    <View
      style={{
        backgroundColor: "#f0fdf4",
        borderColor: "#bbf7d0",
        borderWidth: 1,
        padding: 10,
        borderRadius: 10,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: "#166534", fontWeight: "700" }}>
        Kitchain v0.1 Proof of Concept
      </Text>
      <Text style={{ color: "#166534", marginTop: 4 }}>
        Local AI recipe scanning is experimental. Review each recipe before saving.
      </Text>
    </View>
      <View style={{ gap: 8, marginBottom: 12 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search names, descriptions, or ingredients"
          accessibilityLabel="Search recipes" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {([['newest', 'Newest'], ['oldest', 'Oldest'], ['title', 'A–Z']] as const).map(([value, label]) => (
            <Pressable key={value} haptic="selection" accessibilityRole="radio" accessibilityState={{ selected: order === value }}
              onPress={() => setOrder(value)} style={{ padding: 10, borderRadius: 8, backgroundColor: order === value ? "#1e73ff" : "#eee" }}>
              <Text style={{ color: order === value ? "#fff" : "#111" }}>{label}</Text>
            </Pressable>
          ))}
          {!!query && <Pressable haptic="selection" onPress={() => setQuery("")} style={{ padding: 10 }}><Text>Clear search</Text></Pressable>}
        </View>
        {!loading && !error && <Text accessibilityLiveRegion="polite" style={{ color: "#555" }}>{matches.length} of {data.length} recipes</Text>}
      </View>
    {error ? (
      <View style={{ backgroundColor: "#fef2f2", padding: 12, borderRadius: 10, marginBottom: 12 }}>
        <Text style={{ color: "#991b1b", fontWeight: "600" }}>Recipe list error</Text>
        <Text style={{ color: "#7f1d1d", marginTop: 4 }}>{error}</Text>

        <Pressable
          onPress={load}
          style={{ backgroundColor: "#dc2626", padding: 10, borderRadius: 8, marginTop: 10 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>Try Again</Text>
        </Pressable>
      </View>
    ) : null}

    {loading && data.length === 0 ? (
      <View style={{ backgroundColor: "#f3f4f6", padding: 12, borderRadius: 10, marginBottom: 12 }}>
        <Text style={{ color: "#374151" }}>Loading recipes…</Text>
      </View>
    ) : null}

      <FlatList
        data={matches}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ItemSeparatorComponent={() => <View style={{ height:12 }} />}
        renderItem={({ item }) => (
          <RecipeCard
            title={item.title}
            subtitle={item.description}
            imageUrl={item.image_path ? `${BASE}${item.image_path}` : undefined}
            onPress={() => router.push(`/(recipes)/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          !loading && !error ? <Text style={{ color:"#666" }}>{query.trim() && data.length > 0 ? "No matching recipes. Try another name or ingredient." : "No recipes yet. Add one!"}</Text> : null
        }
      />
    </View>
  );
}
