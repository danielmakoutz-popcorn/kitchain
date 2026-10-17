import type { Recipe } from "./types";

export type RecipeOrder = "newest" | "oldest" | "title";
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Literal, accent-insensitive search. Always sort a copy of the original collection. */
export function findRecipes(recipes: readonly Recipe[], query: string, order: RecipeOrder = "newest"): Recipe[] {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const results = recipes.filter((recipe) => {
    const text = normalize([recipe.title, recipe.description || "", ...(recipe.ingredients || [])].join(" "));
    return words.every((word) => text.includes(word));
  });
  const created = (recipe: Recipe) => Date.parse(recipe.created_at || "") || 0;
  return results.sort((left, right) => order === "title"
    ? left.title.localeCompare(right.title)
    : order === "oldest" ? created(left) - created(right) : created(right) - created(left));
}
