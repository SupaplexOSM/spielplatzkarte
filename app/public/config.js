// Default configuration for local development.
// In Docker, docker-entrypoint.app.sh overwrites this file at container startup.
window.APP_CONFIG = {
  // 'standalone' renders the full regional app; 'hub' renders the federation map.
  // Switch to 'hub' to test Hub mode locally (requires Docker stack on port 8080).
  appMode: 'standalone',

  // --- Standalone mode ---
  osmRelationId: 62700,
  regionPlaygroundWikiUrl: 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground',
  regionChatUrl: '',
  mapZoom: 12,
  mapMinZoom: 10,
  poiRadiusM: 5000,
  // Empty = use Overpass fallback (no PostgREST required for local dev)
  apiBaseUrl: '',
  parentOrigin: '',

  // UI language. Empty = auto-detect from browser. Supported: 'de', 'en'.
  defaultLocale: '',

  // --- Hub mode ---
  registryUrl: './registry.json',
  hubPollInterval: 300,
  // Hub uses a wider default zoom to show all registered regions
  // mapZoom and mapMinZoom above are reused; override here if needed

  // --- Tiered playground delivery (standalone mode in P1) ---
  // Two tiers: cluster (zoom ≤ 13) and polygon (zoom > 13).
  clusterMaxZoom: 13,

  // --- Federated clustering (hub mode, P2) ---
  // Zoom ≤ macroMaxZoom shows the country-level macro view (one ring per
  // backend) and the orchestrator skips per-tier fetches entirely.
  macroMaxZoom: 7,
};
