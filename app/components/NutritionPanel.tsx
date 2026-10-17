import { useRef, useState } from "react";
import { View } from "react-native";
import { KitchenButton, KitchenHeading, KitchenInput, KitchenNotice, KitchenText, PixelFrame } from "@/components/kitchen";
import { discoveryApi } from "@/lib/api";
import { feedback } from "@/lib/haptics";
import type { Food, IngredientOverride, Macros, Nutrition, NutritionRow } from "@/lib/discovery-types";

export function MacroNumbers({ macros, label }: { macros: Macros; label: string }) {
  return <View style={{ gap: 6 }}>
    <KitchenText style={{ fontWeight: "700" }}>{label}</KitchenText>
    <KitchenText>{Math.round(macros.calories)} kcal · {macros.protein.toFixed(1)} g protein</KitchenText>
    <KitchenText>{macros.carbs.toFixed(1)} g carbs · {macros.fat.toFixed(1)} g fat · {macros.fiber.toFixed(1)} g fiber</KitchenText>
  </View>;
}

export function NutritionSummary({ data }: { data: Nutrition }) {
  return <KitchenNotice title="Nutrition estimate">
    {data.per_serving ? <MacroNumbers macros={data.per_serving} label={`Per serving · recipe makes ${data.servings}`} /> : data.totals ? <><MacroNumbers macros={data.totals} label="Whole recipe" /><KitchenText>Add a serving count for per-serving estimates.</KitchenText></> : <><KitchenText>{data.unresolved_count ?? "Some"} ingredient(s) still need a food match or weight.</KitchenText>{data.known_totals && <MacroNumbers macros={data.known_totals} label="Resolved ingredients only · incomplete total" />}</>}
    {!!data.excluded_count && <KitchenText>{data.excluded_count} ingredient(s) excluded by you. Totals omit those ingredients.</KitchenText>}
    <KitchenText>{data.reviewed ? "Your ingredient matches have been reviewed." : "Review suggested food matches, weights and serving size."}</KitchenText>
    <KitchenText style={{ fontSize: 13 }}>{data.source}</KitchenText>
  </KitchenNotice>;
}

function IngredientEditor({ row, value, onChange, disabled, onValidity }: { row: NutritionRow; value: IngredientOverride; onChange: (value: IngredientOverride) => void; disabled: boolean; onValidity: (valid: boolean) => void }) {
  const [query, setQuery] = useState(row.name);
  const [candidates, setCandidates] = useState<Food[]>(row.candidates);
  const [selected, setSelected] = useState(value.food_id && value.food_id !== row.food_id ? row.candidates.find(food => food.id === value.food_id)?.description ?? `USDA food ${value.food_id}` : row.food_name);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [grams, setGrams] = useState(value.grams?.toString() ?? "");
  const searchId = useRef(0);
  async function search() {
    const id = ++searchId.current;
    if (!query.trim()) return;
    setSearching(true); setError("");
    try { const found = await discoveryApi.foods(query.trim()); if (id === searchId.current) setCandidates(found); }
    catch (e: any) { if (id === searchId.current) setError(e.message); }
    finally { if (id === searchId.current) setSearching(false); }
  }
  return <PixelFrame contentStyle={{ padding: 16, gap: 12 }}>
    <KitchenText style={{ fontWeight: "700" }}>{row.line}</KitchenText>
    {value.ignored ? <KitchenText>Excluded from your calculation.</KitchenText> : <>
      <KitchenText>{selected ? `Food: ${selected}` : "Choose a matching food."}</KitchenText>
      {!!row.grams && !value.grams && <KitchenText>Suggested weight: {row.grams} g. Confirm the preparation and portion.</KitchenText>}
      {!!row.reason && <KitchenText>{row.reason}</KitchenText>}
      <KitchenInput label={`Search food for ingredient ${row.index + 1}`} value={query} onChangeText={setQuery} editable={!disabled && !searching} />
      <KitchenButton compact disabled={disabled || searching || !query.trim()} onPress={search}>{searching ? "Searching foods…" : "Search USDA foods"}</KitchenButton>
      {candidates.map(food => <KitchenButton key={food.id} compact disabled={disabled} variant={(value.food_id ?? row.food_id) === food.id ? "primary" : "neutral"} onPress={() => { setSelected(food.description); onChange({ ...value, food_id: food.id, ignored: false }); }}>{`Use ${food.description}`}</KitchenButton>)}
      {!candidates.length && <KitchenText>No food matches loaded. Try another ingredient name.</KitchenText>}
      <KitchenInput label={`Grams for ingredient ${row.index + 1}`} value={grams} placeholder={row.grams?.toString() ?? "Enter edible weight in grams"} keyboardType="decimal-pad" editable={!disabled} onChangeText={text => { setGrams(text); const amount = Number(text.replace(",", ".")); const valid = !text.trim() || (Number.isFinite(amount) && amount > 0); onValidity(valid); onChange({ ...value, grams: text.trim() && valid ? amount : undefined }); setError(valid ? "" : "Enter a positive weight in grams."); }} />
    </>}
    {!!error && <KitchenNotice kind="error">{error}</KitchenNotice>}
    <KitchenButton compact disabled={disabled} onPress={() => { onValidity(true); setError(""); if (error) setGrams(""); onChange({ ...value, ignored: !value.ignored }); }}>{value.ignored ? "Include this ingredient" : "Exclude from calculation"}</KitchenButton>
  </PixelFrame>;
}

export function NutritionPanel({ recipeId }: { recipeId: string | number }) {
  const [data, setData] = useState<Nutrition | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [servings, setServings] = useState("");
  const [overrides, setOverrides] = useState<Record<string, IngredientOverride>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidLines, setInvalidLines] = useState<Set<number>>(new Set());
  const lock = useRef(false);
  async function load() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await discoveryApi.nutrition(recipeId);
      setData(result); setServings(result.servings?.toString() ?? ""); setOverrides(result.saved_overrides ?? {}); setInvalidLines(new Set()); setEditing(false); setOpen(true);
    } catch (e: any) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (!data || lock.current) return;
    if (invalidLines.size) { setEditing(true); return setError("Correct the highlighted ingredient weights before saving."); }
    const count = Number(servings.replace(",", "."));
    if (servings.trim() && (!Number.isFinite(count) || count <= 0)) return setError("Enter a positive serving count.");
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await discoveryApi.saveNutrition(recipeId, { servings: servings.trim() ? count : null, ingredient_hash: data.ingredient_hash, overrides });
      setData(result); setOverrides(result.saved_overrides ?? {}); setEditing(false); feedback("success");
    } catch (e: any) { setError(e.message); feedback("error"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={{ gap: 14 }}>
    <KitchenButton disabled={busy} onPress={() => open ? setOpen(false) : void load()}>{busy ? "Calculating nutrition…" : open ? "Hide nutrition" : "Calculate nutrition"}</KitchenButton>
    {!!error && <KitchenNotice kind="error">{error}</KitchenNotice>}
    {open && data && <>
      <NutritionSummary data={data} />
      {!!data.provenance?.source_name && <KitchenText>Original recipe: {data.provenance.source_name}{data.provenance.source_author ? ` · ${data.provenance.source_author}` : ""}</KitchenText>}
      {data.matches_reset && <KitchenNotice>The ingredients changed. Earlier food corrections were cleared so they cannot attach to the wrong ingredient.</KitchenNotice>}
      <KitchenInput label="Servings in this recipe" keyboardType="decimal-pad" value={servings} onChangeText={setServings} editable={!busy} placeholder="For example, 4" />
      <KitchenButton compact onPress={() => invalidLines.size ? setError("Correct ingredient weights before closing the correction list.") : setEditing(!editing)} disabled={busy}>{editing ? "Hide ingredient corrections" : "Review food matches and weights"}</KitchenButton>
      {editing && <>
        <KitchenHeading subtitle="Choose the food and preparation, then enter grams when the portion is unclear.">Ingredient corrections</KitchenHeading>
        {(data.rows ?? []).map(row => <IngredientEditor key={`${data.ingredient_hash}:${row.index}`} row={row} value={overrides[String(row.index)] ?? {}} onValidity={valid => setInvalidLines(previous => { const next = new Set(previous); if (valid) next.delete(row.index); else next.add(row.index); return next; })} onChange={value => setOverrides(previous => ({ ...previous, [String(row.index)]: value }))} disabled={busy} />)}
      </>}
      <KitchenButton variant="primary" disabled={busy} onPress={save}>{busy ? "Saving nutrition…" : "Save nutrition corrections"}</KitchenButton>
    </>}
  </View>;
}
