import Constants from "expo-constants";

const BASE = (Constants.expoConfig as any)?.extra?.apiBase || process.env.EXPO_PUBLIC_API_BASE;

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

console.log("EXPO_PUBLIC_API_BASE =", process.env.EXPO_PUBLIC_API_BASE);
console.log("API BASE =", BASE);

export const api = {
  health: () => json<{ status: string }>("api/v1/health"),
  listRecipes: () => json<any[]>("/api/v1/recipes/"),
  getRecipe: (id: string | number) => json<any>(`/api/v1/recipes/${id}`),
  createRecipe: (data: {
    title: string;
    description?: string;
    ingredients?: string;
  }) => json<any>("/api/v1/recipes/", { method: "POST", body: JSON.stringify(data) }),
};

export function tryParse<T>(schema: { parse: (v: unknown) => T }, data: any): T {
  try { return (schema as any).parse(data); } catch { return data as T; }
}
