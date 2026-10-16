import Constants from "expo-constants";

export const API_BASE = String(Constants.expoConfig?.extra?.apiBase || process.env.EXPO_PUBLIC_API_BASE || "").replace(/\/+$/, "");

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("Set EXPO_PUBLIC_API_BASE to your KitChain server address, then restart Expo.");
  const headers = new Headers(init?.headers);
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
    } catch { /* Keep the status when a server/proxy sends a non-JSON error. */ }
    throw new Error(message);
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

export function tryParse<T>(schema: { parse: (v: unknown) => T }, data: any): T {
  try { return (schema as any).parse(data); } catch { return data as T; }
}
