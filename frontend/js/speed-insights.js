// Vercel Speed Insights
// This file loads and initializes Vercel Speed Insights for performance monitoring
import { injectSpeedInsights } from 'https://cdn.jsdelivr.net/npm/@vercel/speed-insights@1/+esm';

// Initialize Speed Insights
injectSpeedInsights({
  debug: false
});
