import { Link } from "expo-router";
import { View, Text } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";

export default function Home() {
  return (
    <View style={{ flex:1, padding:16, gap:12, justifyContent:"center" }}>
      <Text style={{ fontSize:24, fontWeight:"600" }}>KitChain</Text>
      <Link href="/(recipes)" asChild><HapticPressable><Text style={{ fontSize:18, color:"#1e73ff" }}>Recipes</Text></HapticPressable></Link>
      <Link href="/(recipes)/AddRecipe" asChild><HapticPressable><Text style={{ fontSize:18, color:"#1e73ff" }}>Add Recipe (Manual)</Text></HapticPressable></Link>
      <Link href="/(recipes)/AddFromPhoto" asChild><HapticPressable><Text style={{ fontSize:18, color:"#1e73ff" }}>Add from Photo</Text></HapticPressable></Link>
    </View>
  );
}
