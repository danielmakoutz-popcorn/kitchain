export type Macros = { calories: number; protein: number; carbs: number; fat: number; fiber: number };
export type Food = { id: number; description: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null; portions: { unit: string; grams: number; amount: number }[] };
export type IngredientOverride = { food_id?: number; grams?: number; ignored?: boolean };
export type NutritionRow = { index: number; line: string; name: string; food_id: number | null; food_name: string | null; grams: number | null; status: "confirmed" | "estimated" | "unresolved" | "excluded"; reason: string | null; candidates: Food[]; macros: Macros | null };
export type Nutrition = {
  ingredient_hash: string; servings: number | null; complete: boolean; reviewed: boolean;
  totals: Macros | null; known_totals: Macros; per_serving: Macros | null;
  unresolved_count: number; excluded_count: number; source: string; notice: string;
  rows?: NutritionRow[]; saved_overrides?: Record<string, IngredientOverride>; matches_reset?: boolean;
  provenance?: { source_url: string | null; source_name: string | null; source_author: string | null; license_url: string | null; public_id: number | null } | null;
};
export type PublicRecipe = {
  id: number; title: string; source_url: string | null; source_name: string; source_author: string | null;
  license_url: string | null; reuse_status: "link_only" | "licensed" | "contributed";
  ingredients: string[]; ingredient_names: string[]; steps: string[]; servings: number | null;
  total_minutes: number | null; nutrition: Nutrition; created_at: string;
  rating_average: number | null; rating_count: number; my_rating: number | null;
  can_remove: boolean; can_copy: boolean;
};
export type SearchUsage = { provider: string; configured: boolean; monthly_limit: number; monthly_used: number; text_ai_enabled: boolean; text_ai_model: string };
export type Recommendation = {
  key: string; kind: "family" | "public"; id: number; title: string; ingredient_names: string[];
  source_url: string | null; source_name: string; source_author: string | null;
  total_minutes: number | null; servings: number | null; nutrition: Nutrition;
  missing_ingredients: string[]; reasons: string[]; rating_average: number | null; rating_count: number;
};
export type RecommendationResult = { choices: Recommendation[]; searched_web: boolean; text_ai_used: boolean; warnings: string[]; unread_sources?: { title: string; url: string; reason: string }[]; notice: string; usage: SearchUsage };
export type RecommendInput = { query: string; pantry: string[]; excluded: string[]; max_minutes?: number; min_protein?: number; max_calories?: number; mode: "family" | "public"; allow_web: boolean };
