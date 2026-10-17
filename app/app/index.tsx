import { Link } from "expo-router";
import { View } from "react-native";
import { ArtSlot } from "@/components/ArtSlot";
import { kitchen as c, kitchenFonts } from "@/constants/kitchen";
import { KitchenButton, KitchenScroll, KitchenText, PixelFrame, PixelIcon, Flourish } from "@/components/kitchen";

export default function Home() {
  return <KitchenScroll contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: 24 }}>
    <View style={{ alignItems: "center", gap: 10 }}>
      <ArtSlot name="homeHero" fallback={<View style={{ width: 96, height: 72, alignItems: "center", justifyContent: "center" }}><PixelIcon name="herb" color={c.greenShade} size={52} /></View>} />
      <KitchenText accessibilityRole="header" style={{ fontFamily: kitchenFonts.heading, fontSize: 44, lineHeight: 54, fontWeight: "800" }}>KitChain</KitchenText>
      <KitchenText style={{ color: c.muted, textAlign: "center" }}>A home for the recipes you keep.</KitchenText>
      <Flourish />
    </View>
    <PixelFrame ornate contentStyle={{ padding: 26, gap: 16 }}>
      <KitchenText style={{ fontFamily: kitchenFonts.heading, fontSize: 24, lineHeight: 32, fontWeight: "700" }}>Welcome to your kitchen</KitchenText>
      <KitchenText>Keep a family favorite, scan a recipe card, or write something new.</KitchenText>
      <Link href="/(recipes)/AddFromPhoto" asChild><KitchenButton variant="primary" icon="scan">Scan with AI</KitchenButton></Link>
      <Link href="/(recipes)" asChild><KitchenButton variant="butter" icon="book">Your recipe collection</KitchenButton></Link>
      <Link href="/(recipes)/AddRecipe" asChild><KitchenButton icon="plus">Write a recipe</KitchenButton></Link>
    </PixelFrame>
    <KitchenText style={{ color: c.muted, textAlign: "center", fontSize: 14 }}>Old favorites. New traditions.</KitchenText>
  </KitchenScroll>;
}
