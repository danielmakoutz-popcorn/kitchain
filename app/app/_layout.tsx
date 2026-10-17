import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { kitchen as c, kitchenFonts } from "@/constants/kitchen";
import { KitchenDialogProvider, KitchenText, PixelIcon } from "@/components/kitchen";

export default function Layout() {
  return <KitchenDialogProvider>
    <StatusBar style="dark" />
    <Stack screenOptions={{
      headerTitle: () => <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><PixelIcon name="herb" color={c.greenShade} size={22} /><KitchenText style={{ fontFamily: kitchenFonts.heading, fontWeight: "700", fontSize: 22 }}>KitChain</KitchenText></View>,
      headerBackTitle: "Back", headerTintColor: c.espresso,
      headerStyle: { backgroundColor: c.ivory }, headerShadowVisible: false,
      contentStyle: { backgroundColor: c.ivory },
    }} />
  </KitchenDialogProvider>;
}
