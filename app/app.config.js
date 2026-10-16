import 'dotenv/config';

// Keep app.json's icon, splash, platform and plugin settings when adding the API URL.
module.exports = ({ config }) => ({
  ...config,
  name: "KitChain",
  slug: "kitchain",
  experiments: { ...config.experiments, typedRoutes: true },
  extra: { ...config.extra, apiBase: process.env.EXPO_PUBLIC_API_BASE },
});
