// app.config.js at project root (next to package.json)
import 'dotenv/config';
module.exports = {
  expo: {
    name: "KitChain",
    slug: "kitchain",
    plugins: ["expo-router"],
    experiments: { typedRoutes: true },
    extra: {
      apiBase: process.env.EXPO_PUBLIC_API_BASE
    }
  }
}
