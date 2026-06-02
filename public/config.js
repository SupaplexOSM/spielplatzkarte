// Default configuration — overwritten at container startup via docker-entrypoint.sh
window.APP_CONFIG = {
  osmRelationId: 62700,
  regionPlaygroundWikiUrl: 'https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dplayground',
  regionChatUrl: '',
  mapZoom: 12,
  mapMinZoom: 10,
  poiRadiusM: 5000,
  apiBaseUrl: '',
  parentOrigin: ''  // leave empty — defaults to '*' via js/config.js (messages reach any hub origin)
};
