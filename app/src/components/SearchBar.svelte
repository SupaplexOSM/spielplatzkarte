<script>
  import { fromLonLat } from 'ol/proj';
  import { mapStore } from '../stores/map.js';
  import { Search, Loader2, X } from 'lucide-svelte';
  import { cn } from '../lib/utils.js';
  import { _ } from 'svelte-i18n';

  /** Bounding box [minLon, minLat, maxLon, maxLat] to restrict Nominatim search. */
  export let regionExtent = null;
  /** Called with (lat, lon) after a result is selected; called with (null, null) on clear. */
  export let onlocation = null;

  let query = '';
  let searching = false;
  let results = [];
  let showResults = false;
  let inputEl;

  async function search() {
    const q = query.trim();
    if (!q) {
      results = [];
      showResults = false;
      return;
    }
    searching = true;
    try {
      const base = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=10`;
      let viewCenterLon = null;
      let viewCenterLat = null;
      let hits;
      if (regionExtent) {
        const [minLon, minLat, maxLon, maxLat] = regionExtent;
        const viewboxParam = `&viewbox=${minLon},${minLat},${maxLon},${maxLat}`;
        viewCenterLon = (minLon + maxLon) / 2;
        viewCenterLat = (minLat + maxLat) / 2;
        // Phase 1: bounded=1 — only results within the current viewport.
        // Handles common street names that would otherwise be drowned out by
        // same-named streets in larger cities.
        const res1 = await fetch(base + viewboxParam + '&bounded=1');
        if (!res1.ok) throw new Error(`Nominatim error: ${res1.status}`);
        hits = await res1.json();
        // Phase 2: fall back to unbounded if the viewport returned nothing —
        // preserves the ability to search for a city name to navigate there.
        if (!hits.length) {
          const res2 = await fetch(base + viewboxParam + '&bounded=0');
          if (!res2.ok) throw new Error(`Nominatim error: ${res2.status}`);
          hits = await res2.json();
        }
      } else {
        const res = await fetch(base);
        if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
        hits = await res.json();
      }
      if (viewCenterLon !== null) {
        hits = hits.slice().sort((a, b) => {
          const da = (parseFloat(a.lon) - viewCenterLon) ** 2 + (parseFloat(a.lat) - viewCenterLat) ** 2;
          const db = (parseFloat(b.lon) - viewCenterLon) ** 2 + (parseFloat(b.lat) - viewCenterLat) ** 2;
          return da - db;
        });
      }
      results = hits.slice(0, 5);
      showResults = results.length > 0;
    } catch (err) {
      console.error('Search failed:', err);
      results = [];
      showResults = false;
    } finally {
      searching = false;
    }
  }

  function selectResult(result) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const coord = fromLonLat([lon, lat]);
    $mapStore?.getView().animate({ center: coord, zoom: 17 });
    query = result.display_name.split(',')[0];
    showResults = false;
    if (onlocation) onlocation(lat, lon);
  }

  function onKeydown(e) {
    if (e.key === 'Enter') search();
    if (e.key === 'Escape') {
      showResults = false;
      inputEl?.blur();
    }
  }

  function onInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (query.length >= 2) search();
    }, 450);
  }

  let searchTimeout;

  function clearSearch() {
    query = '';
    results = [];
    showResults = false;
    inputEl?.focus();
    if (onlocation) onlocation(null, null);
  }

  function onFocus() {
    if (results.length > 0) showResults = true;
  }

  function onBlur(e) {
    // Delay hiding to allow click on results
    setTimeout(() => {
      showResults = false;
    }, 200);
  }
</script>

<div class="search-card">
  <div class="search-input-wrapper">
    <div class="search-icon">
      {#if searching}
        <Loader2 class="h-5 w-5 text-gray-400 animate-spin" />
      {:else}
        <Search class="h-5 w-5 text-gray-400" />
      {/if}
    </div>
    <input
      bind:this={inputEl}
      type="text"
      class="search-input"
      placeholder={$_('search.placeholder')}
      bind:value={query}
      onkeydown={onKeydown}
      oninput={onInput}
      onfocus={onFocus}
      onblur={onBlur}
      aria-label={$_('search.ariaLabel')}
    />
    {#if query}
      <button class="clear-btn" onclick={clearSearch} aria-label={$_('search.clearLabel')}>
        <X class="h-4 w-4 text-gray-400" />
      </button>
    {/if}
  </div>

  {#if showResults && results.length > 0}
    <div class="search-results">
      {#each results as result}
        <button class="result-item" onclick={() => selectResult(result)}>
          <MapPin class="h-4 w-4 text-gray-400 shrink-0" />
          <span class="result-text">{result.display_name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<script context="module">
  import { MapPin } from 'lucide-svelte';
</script>

<style>
  .search-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    width: 300px;
    max-width: calc(100vw - 5rem);
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    padding: 0 12px;
    height: 48px;
  }

  .search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 12px;
  }

  .search-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 15px;
    background: transparent;
    color: #202124;
  }

  .search-input::placeholder {
    color: #9aa0a6;
  }

  .search-input:disabled {
    opacity: 0.6;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    margin: -8px;
    margin-left: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 50%;
  }

  .clear-btn:hover {
    background: #f1f3f4;
  }

  .search-results {
    border-top: 1px solid #e8eaed;
    max-height: 280px;
    overflow-y: auto;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    width: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .result-item:hover {
    background: #f1f3f4;
  }

  .result-text {
    font-size: 14px;
    color: #202124;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
