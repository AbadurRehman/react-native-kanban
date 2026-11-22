// Adds to app.json: when EXPO_BASE_URL is set (the GitHub Pages build), the
// web export is served from that path instead of the domain root.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
