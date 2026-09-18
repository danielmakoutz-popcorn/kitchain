import { useEffect, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import { Link, useRouter } from "expo-router";
import { api, tryParse } from "../../lib/api";
import { Recipe, RecipeSchema } from "../../lib/types";
import { RecipeCard } from "../../components/RecipeCard";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import Constants from "expo-constants";

const BASE =
  (Constants.expoConfig as any)?.extra?.apiBase ??
  process.env.EXPO_PUBLIC_API_BASE ??
  "http://192.168.x.x:8000";

export default function RecipeList() {
  const [data, setData] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
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
        <Link href="/(recipes)/AddRecipe" style={{ color:"#1e73ff", fontSize:16 }}>+ Add Recipe</Link>
        <Link href="/(recipes)/AddFromPhoto" style={{ color:"#1e73ff", fontSize:16 }}>+ Add from Photo</Link>
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
        Local AI handwritten recipe scanning is experimental. please review before saving. Qwen2.5-VL.
      </Text>
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
        data={data}
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
          !loading ? <Text style={{ color:"#666" }}>No recipes yet. Add one!</Text> : null
        }
      />
    </View>
  );
}
