import { fetch } from "expo/fetch";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Food, IngredientOverride, Nutrition, PublicRecipe, RecommendationResult, RecommendInput, SearchUsage } from "./discovery-types";
import type { Pantry, PantryPhoto } from "./pantry";

export const API_BASE = String(Constants.expoConfig?.extra?.apiBase || process.env.EXPO_PUBLIC_API_BASE || "").replace(/\/+$/, "");
const PROFILE_KEY = `kitchain-community-profile:${API_BASE}`;
type CookProfile = { id: string; name: string };
let profilePromise: Promise<CookProfile> | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("Set EXPO_PUBLIC_API_BASE to your KitChain server address, then restart Expo.");
  const headers = new Headers(init?.headers);
  const token = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_BASE}/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = `${body.detail[0].loc?.slice(1).join(" · ") || "Request"}: ${body.detail[0].msg}`;
    } catch { /* Keep the status when a server/proxy sends a non-JSON error. */ }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => requestJson<{ status: string }>("/api/v1/health"),
  listRecipes: () => requestJson<any[]>("/api/v1/recipes/"),
  getRecipe: (id: string | number) => requestJson<any>(`/api/v1/recipes/${id}`),
  createRecipe: (data: {
    title: string;
    description?: string;
    ingredients?: string[];
    steps?: string[];
    instructions?: string;
  }) => requestJson<any>("/api/v1/recipes/", { method: "POST", body: JSON.stringify(data) }),
};

export async function ensureCook() {
  profilePromise ??= (async () => {
    const token = await AsyncStorage.getItem(PROFILE_KEY);
    if (token) {
      try { return await requestJson<CookProfile>("/api/v1/community/me"); }
      catch (error) {
        // Network/server errors must never silently replace the owner of a private pantry.
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
    }
    const profile = await requestJson<CookProfile & { token: string }>("/api/v1/community/members", { method: "POST", body: JSON.stringify({ name: "Home cook" }) });
    await AsyncStorage.setItem(PROFILE_KEY, profile.token);
    return { id: profile.id, name: profile.name };
  })().catch(error => { profilePromise = null; throw error; });
  return profilePromise;
}

async function cookRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureCook();
  return requestJson<T>(path, init);
}

export const discoveryApi = {
  status: () => requestJson<SearchUsage>("/api/v1/discovery/status"),
  recommend: (data: RecommendInput) => cookRequest<RecommendationResult>("/api/v1/discovery/recommendations", { method: "POST", body: JSON.stringify(data) }),
  importLink: (url: string) => cookRequest<PublicRecipe>("/api/v1/discovery/import", { method: "POST", body: JSON.stringify({ url }) }),
  listPublic: (query = "", order: "newest" | "rating" = "newest", offset = 0) => requestJson<PublicRecipe[]>(`/api/v1/public/recipes?q=${encodeURIComponent(query)}&order=${order}&offset=${offset}`),
  getPublic: (id: number | string) => requestJson<PublicRecipe>(`/api/v1/public/recipes/${id}`),
  rate: (id: number | string, stars: number) => cookRequest<PublicRecipe>(`/api/v1/public/recipes/${id}/rating`, { method: "PUT", body: JSON.stringify({ stars, cooked: true }) }),
  removeRating: (id: number | string) => cookRequest(`/api/v1/public/recipes/${id}/rating`, { method: "DELETE" }),
  publish: (id: number | string) => cookRequest<PublicRecipe>(`/api/v1/public/from-family/${id}`, { method: "POST", body: JSON.stringify({ own_recipe: true }) }),
  unpublish: (id: number | string) => cookRequest(`/api/v1/public/recipes/${id}`, { method: "DELETE" }),
  copy: (id: number | string) => cookRequest<{ id: number }>(`/api/v1/public/recipes/${id}/copy`, { method: "POST" }),
  nutrition: (id: number | string) => requestJson<Nutrition>(`/api/v1/nutrition/recipes/${id}`),
  recipeSource: (id: number | string) => requestJson<Nutrition["provenance"]>(`/api/v1/nutrition/recipes/${id}/source`),
  saveNutrition: (id: number | string, data: { servings: number | null; ingredient_hash: string; overrides: Record<string, IngredientOverride> }) => requestJson<Nutrition>(`/api/v1/nutrition/recipes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  foods: (query: string) => requestJson<Food[]>(`/api/v1/nutrition/foods?q=${encodeURIComponent(query)}`),
};

export const pantryApi = {
  get: () => cookRequest<Pantry>("/api/v1/pantry"),
  save: (data: Pantry) => cookRequest<Pantry>("/api/v1/pantry", { method: "PUT", body: JSON.stringify(data) }),
  photo: (body: FormData, signal?: AbortSignal) => cookRequest<PantryPhoto>("/api/v1/pantry/photo", { method: "POST", body, signal }),
};

export function tryParse<T>(schema: { parse: (v: unknown) => T }, data: any): T {
  try { return (schema as any).parse(data); } catch { return data as T; }
}
