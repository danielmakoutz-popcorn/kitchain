import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Image, Keyboard, Platform, View } from "react-native";
import { Link } from "expo-router";
import { KitchenButton, KitchenHeading, KitchenInput, KitchenNotice, KitchenScroll, KitchenText, PixelFrame, useKitchenDialog } from "@/components/kitchen";
import { usePantry } from "@/hooks/use-pantry";
import { pantryApi } from "@/lib/api";
import { photoForm } from "@/lib/photos";
import { ingredientList, validatePantry } from "@/lib/pantry";
import { feedback } from "@/lib/haptics";

export default function Pantry() {
  const pantry = usePantry();
  const dialog = useKitchenDialog();
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const pickerLock = useRef(false);
  const mounted = useRef(true);
  const busy = scanning || picking || pantry.saving;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  async function pick(camera: boolean) {
    if (busy || pickerLock.current) return;
    pickerLock.current = true; setPicking(true); setError(""); Keyboard.dismiss();
    try {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Camera access is needed to take a photo. You can choose an existing photo or enter ingredient names instead.");
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: .75 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0] && mounted.current) {
        setPhoto(result.assets[0]); setReview(null); setUncertain([]);
      }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Could not open the camera or photo library."); }
    finally { pickerLock.current = false; if (mounted.current) setPicking(false); }
  }

  async function scan() {
    if (!photo || busy || controller.current) return;
    const request = new AbortController(); controller.current = request;
    setScanning(true); setError(""); Keyboard.dismiss();
    const timeout = setTimeout(() => request.abort(), 210_000);
    try {
      const result = await pantryApi.photo(await photoForm(photo), request.signal);
      if (!mounted.current || controller.current !== request) return;
      setReview(result.ingredients.join("\n")); setUncertain(result.uncertain_items);
      feedback(result.uncertain_items.length ? "warning" : "success");
    } catch (e) {
      if (mounted.current) {
        setError(request.signal.aborted ? "This ingredient scan took too long. Try a closer photo or enter names manually." : e instanceof Error ? e.message : "Could not read these ingredients.");
        feedback("error");
      }
    } finally {
      clearTimeout(timeout); controller.current = null;
      if (mounted.current) setScanning(false);
    }
  }

  function addReview() {
    if (review === null) return;
    try {
      const items = validatePantry(ingredientList(pantry.text + "\n" + review));
      pantry.edit(items.join("\n")); setReview(null); setPhoto(null); setUncertain([]);
      setError(""); feedback("selection");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add these ingredients."); }
  }

  return <KitchenScroll>
    <KitchenHeading subtitle="Keep track of ingredients for your next meal.">My pantry</KitchenHeading>
    <KitchenText>Saved privately for this device’s cook profile. Your pantry fills the ingredient list in recipe recommendations.</KitchenText>
    <Link href="/discover" asChild><KitchenButton compact icon="search">Find a meal with my pantry</KitchenButton></Link>
    {!!pantry.error && <KitchenNotice kind="error">{pantry.error}</KitchenNotice>}
    {!!error && <KitchenNotice kind="error">{error}</KitchenNotice>}
    {!pantry.ready && !pantry.error && <KitchenNotice>Opening your pantry…</KitchenNotice>}
    <PixelFrame ornate contentStyle={{ padding: 20, gap: 14 }}>
      <KitchenHeading>Your ingredients</KitchenHeading>
      <KitchenInput label="Pantry ingredients · comma or line separated" multiline value={pantry.text} onChangeText={pantry.edit} editable={pantry.ready && !busy} placeholder="Ground beef, rice, bell peppers…" maxLength={8100} style={{ minHeight: 200 }} />
      <KitchenText>{ingredientList(pantry.text).length} / 80 ingredients. Edit a name or remove its line when you use it up. Quantities and freshness still need checking.</KitchenText>
      <KitchenButton variant="primary" disabled={!pantry.ready || busy} onPress={() => { Keyboard.dismiss(); void pantry.save().then(saved => feedback(saved ? "success" : "error")); }}>{pantry.saving ? "Saving pantry…" : "Save pantry"}</KitchenButton>
      {pantry.dirty && <KitchenText>You have unsaved pantry changes. Your draft stays on this device until you save.</KitchenText>}
      {!!pantry.notice && <KitchenNotice kind="success">{pantry.notice}</KitchenNotice>}
      <KitchenButton disabled={busy} onPress={() => {
        if (pantry.dirty) dialog.alert("Reload saved pantry?", "This replaces the ingredient edits on screen with your last saved pantry.", [{ text: "Keep editing", style: "cancel" }, { text: "Reload pantry", onPress: () => void pantry.reload() }]);
        else void pantry.reload();
      }}>Reload saved pantry</KitchenButton>
    </PixelFrame>
    <PixelFrame contentStyle={{ padding: 20, gap: 14 }}>
      <KitchenHeading>Add ingredients from a photo</KitchenHeading>
      <KitchenText>Take a clear photo of a few ingredients, groceries, or a written list. Review the suggested names before adding them.</KitchenText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <KitchenButton compact disabled={!pantry.ready || busy} onPress={() => void pick(true)}>Take ingredient photo</KitchenButton>
        <KitchenButton compact disabled={!pantry.ready || busy} onPress={() => void pick(false)}>Choose ingredient photo</KitchenButton>
      </View>
      {!!photo && <>
        <Image source={{ uri: photo.uri }} accessibilityLabel="Ingredient photo preview" style={{ width: "100%", height: 220, resizeMode: "contain" }} />
        <KitchenButton variant="primary" disabled={busy} onPress={() => void scan()}>{scanning ? "Identifying ingredients…" : "Read ingredient photo"}</KitchenButton>
      </>}
      {scanning && <KitchenNotice>Reading this photo with your existing vision model. This can take a moment.</KitchenNotice>}
      {review !== null && <>
        <KitchenInput label="Review photo ingredients" multiline value={review} onChangeText={setReview} editable={!busy} placeholder="Enter any ingredients you recognize" maxLength={8100} />
        {!!uncertain.length && <KitchenNotice>{`Please check these uncertain items: ${uncertain.join(", ")}. Add any correct names to the review list yourself.`}</KitchenNotice>}
        {!review.trim() && <KitchenNotice>No clear ingredient names were found. Enter names above or try a closer photo.</KitchenNotice>}
        <KitchenButton disabled={busy || !review.trim()} onPress={addReview}>Add reviewed ingredients</KitchenButton>
        <KitchenText>Adding merges these names into your draft. Tap Save pantry to keep the updated list.</KitchenText>
      </>}
    </PixelFrame>
  </KitchenScroll>;
}
