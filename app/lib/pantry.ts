export type Pantry = { items: string[]; revision: number };
export type PantryPhoto = { ingredients: string[]; uncertain_items: string[]; notice: string };

export function ingredientList(text: string): string[] {
  const names = new Map<string, string>();
  for (const line of text.split(/[,\n]/)) {
    const name = line.replace(/\s+/g, " ").trim();
    if (name) names.set(name.toLocaleLowerCase(), name);
  }
  return [...names.values()];
}

export function validatePantry(items: string[]) {
  if (items.length > 80) throw new Error("Keep up to 80 pantry ingredients. Remove a few before saving.");
  if (items.some(item => item.length > 100)) throw new Error("Use ingredient names of up to 100 characters each.");
  return items;
}
