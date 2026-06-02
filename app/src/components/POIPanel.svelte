<script>
  import { haversineDistance, formatDistance, bearingDeg, bearingToDir } from '../lib/playgroundHelpers.js';
  import { poiRadiusM } from '../lib/config.js';
  import { _ } from 'svelte-i18n';

  /** @type {Array} POI objects from fetchNearbyPOIs */
  export let pois = [];
  /** @type {number} Playground centre latitude (WGS84) */
  export let centerLat = 0;
  /** @type {number} Playground centre longitude (WGS84) */
  export let centerLon = 0;

  $: CATEGORIES = [
    {
      icon: '🚻', label: $_('poi.categories.toilets'),
      match: f => f.amenity === 'toilets',
      fallback: $_('poi.fallbacks.toilets'),
    },
    {
      icon: '🚌', label: $_('poi.categories.busStops'),
      match: f => f.highway === 'bus_stop',
      fallback: $_('poi.fallbacks.busStops'),
      hint: (poi) => poi.tags.towards
        ? `→ ${poi.tags.towards}`
        : $_('compass.' + bearingToDir(bearingDeg(centerLat, centerLon, poi.lat, poi.lon))),
    },
    {
      icon: '🍦', label: $_('poi.categories.iceCream'),
      match: f => f.amenity === 'ice_cream' || (f.cuisine && f.cuisine.includes('ice_cream')),
      fallback: $_('poi.fallbacks.iceCream'),
    },
    {
      icon: '🛒', label: $_('poi.categories.shopping'),
      match: f => f.shop === 'supermarket' || f.shop === 'convenience',
      fallback: $_('poi.fallbacks.shopping'),
    },
    {
      icon: '🧴', label: $_('poi.categories.drugstore'),
      match: f => f.shop === 'chemist',
      fallback: $_('poi.fallbacks.drugstore'),
    },
    {
      icon: '🏥', label: $_('poi.categories.emergency'),
      match: f => (f.emergency === 'yes' && ['hospital', 'clinic', 'doctors'].includes(f.amenity)) || f['healthcare:speciality'] === 'emergency',
      fallback: $_('poi.fallbacks.emergency'),
    },
  ];

  $: enriched = pois.map(p => ({
    ...p,
    dist: haversineDistance(centerLat, centerLon, p.lat, p.lon),
  }));

  $: sections = CATEGORIES.map(cat => {
    const seen = new Set();
    const matches = enriched
      .filter(p => cat.match(p.tags))
      .sort((a, b) => a.dist - b.dist)
      .filter(p => {
        const key = (p.tags.name || cat.fallback).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 2);
    return { ...cat, matches };
  }).filter(s => s.matches.length);
</script>

{#if sections.length === 0}
  <small class="text-muted">
    {$_('poi.noNearby', { values: { radius: (poiRadiusM / 1000).toFixed(0) } })}
  </small>
{:else}
  {#each sections as cat}
    <div class="mb-2">
      <small class="text-muted fw-bold text-uppercase" style="font-size:0.7rem;">
        {cat.icon} {cat.label}
      </small>
      {#each cat.matches as poi}
        {@const name = poi.tags.name || cat.fallback}
        {@const hint = cat.hint ? cat.hint(poi) : null}
        {@const geoUrl = `geo:${poi.lat},${poi.lon}?q=${poi.lat},${poi.lon}(${encodeURIComponent(name)})`}
        {@const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${centerLat},${centerLon};${poi.lat},${poi.lon}`}
        <a href={geoUrl} class="poi-row link-mobile-only" title={$_('poi.openNavApp')}>
          <span class="poi-name">{name}{#if hint}<span class="poi-hint">({hint})</span>{/if}</span>
          <span class="poi-dist">{formatDistance(poi.dist)}</span>
        </a>
        <a href={osmUrl} target="_blank" rel="noopener" class="poi-row link-desktop-only" title={$_('poi.openInBrowser')}>
          <span class="poi-name">{name}{#if hint}<span class="poi-hint">({hint})</span>{/if}</span>
          <span class="poi-dist">{formatDistance(poi.dist)}</span>
        </a>
      {/each}
    </div>
  {/each}
{/if}

<style>
  .poi-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: smaller;
    color: #10b981;
    text-decoration: none;
  }
  .poi-row:hover .poi-name { text-decoration: underline; }
  .poi-name { flex: 1; }
  .poi-hint {
    color: #6b7280;
    margin-left: 0.25rem;
    font-size: 0.7rem;
  }
  .poi-dist { white-space: nowrap; color: #6b7280; }

  /* geo: links open mobile nav apps — hide on desktop */
  .link-mobile-only  { display: flex; }
  .link-desktop-only { display: none; }

  @media (min-width: 1024px) {
    .link-mobile-only  { display: none; }
    .link-desktop-only { display: flex; }
  }
</style>
