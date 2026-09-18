import { Link } from "expo-router";
import { View, Text } from "react-native";

export default function Home() {
  return (
    <View style={{ flex:1, padding:16, gap:12, justifyContent:"center" }}>
      <Text style={{ fontSize:24, fontWeight:"600" }}>KitChain</Text>
      <Link href="/(recipes)" style={{ fontSize:18, color:"#1e73ff" }}>Recipes</Link>
      <Link href="/(recipes)/AddRecipe" style={{ fontSize:18, color:"#1e73ff" }}>Add Recipe (Manual)</Link>
      <Link href="/(recipes)/AddFromPhoto" style={{ fontSize:18, color:"#1e73ff" }}>Add from Photo</Link>
    </View>
  );
}
