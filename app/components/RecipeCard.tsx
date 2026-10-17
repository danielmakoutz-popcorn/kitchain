import { View, Image } from "react-native";
import { HapticPressable } from "./HapticPressable";
import { ArtSlot } from "./ArtSlot";
import { kitchen as c, kitchenFonts } from "@/constants/kitchen";
import { KitchenText, PixelFrame, PixelIcon } from "./kitchen";

export function RecipeCard({ title, subtitle, imageUrl, onPress }: {
  title: string; subtitle?: string | null; imageUrl?: string | null; onPress?: () => void;
}) {
  return <HapticPressable onPress={onPress} accessibilityLabel={`Open recipe: ${title}`} style={{ paddingBottom: 4 }}>
    <PixelFrame ornate contentStyle={{ padding: 18, gap: 12 }}>
      <View style={{ backgroundColor: c.ivory, borderWidth: 1, borderColor: c.border, padding: 5 }}>
        {imageUrl ? <Image source={{ uri: imageUrl }} resizeMode="cover" accessibilityLabel={`Photo of ${title}`} style={{ width: "100%", height: 170 }} /> : <View style={{ height: 150, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ArtSlot name="recipePlaceholder" fallback={<PixelIcon name="book" size={40} color={c.border} />} />
          <KitchenText style={{ color: c.muted, fontSize: 14 }}>A recipe worth keeping</KitchenText>
        </View>}
      </View>
      <KitchenText style={{ fontFamily: kitchenFonts.heading, fontSize: 22, lineHeight: 28, fontWeight: "700" }}>{title}</KitchenText>
      {!!subtitle && <KitchenText numberOfLines={3} style={{ color: c.muted }}>{subtitle}</KitchenText>}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><PixelIcon name="book" size={14} color={c.muted} /><KitchenText style={{ color: c.muted, fontSize: 13 }}>Your collection</KitchenText></View>
    </PixelFrame>
  </HapticPressable>;
}
