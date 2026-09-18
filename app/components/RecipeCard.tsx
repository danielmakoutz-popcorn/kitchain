import { View, Text, Image, Pressable } from "react-native";

export function RecipeCard({
  title,
  subtitle,
  imageUrl,
  onPress,
}: {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ borderWidth:1, borderColor:"#e5e7eb", borderRadius:12, overflow:"hidden" }}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 160 }} />
      ) : (
        <View style={{ height:160, backgroundColor:"#f2f2f2", alignItems:"center", justifyContent:"center" }}>
          <Text style={{ color:"#888" }}>No Image</Text>
        </View>
      )}
      <View style={{ padding:12 }}>
        <Text style={{ fontSize:18, fontWeight:"600" }}>{title}</Text>
        {subtitle ? <Text style={{ color:"#555", marginTop:4 }}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}
