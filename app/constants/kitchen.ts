import { Platform } from "react-native";

/** The agreed KitChain palette. Keep Daniel's sprites on these same anchors. */
export const kitchen = {
  ivory: "#FFF7E6", parchment: "#EFD5A3", terracotta: "#E1845F",
  herb: "#9CBB78", espresso: "#543A31", butter: "#F7D66D", tomato: "#E56F56",
  // Tonal companions for edges and readable, persistent status text.
  paper: "#FFF0D0", border: "#B48451", muted: "#76594B", greenInk: "#38542A",
  greenShade: "#72924F", redInk: "#852F26", errorPaper: "#FCE4D8", highlight: "#FFFBEF",
};
export const kitchenFonts = {
  heading: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
};
