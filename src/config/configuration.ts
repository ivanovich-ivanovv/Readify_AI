export default () => ({
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  chroma: {
    url: process.env.CHROMA_URL || 'http://localhost:8000',
  },
});
