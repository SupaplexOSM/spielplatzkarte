<script context="module">
  // Module-scoped cache so a single `get_meta()` per backend URL is shared
  // across every PlaygroundPanel mount (the panel re-mounts on every
  // selection cycle in standalone). Successful results stay cached for
  // the page lifetime; failures are NOT cached so a transient network
  // blip doesn't permanently hide the chip.
  const metaCache = new Map();
</script>

<script>
  import { onMount, onDestroy } from 'svelte';
  import OpeningHours from 'opening_hours';
  import { transform } from 'ol/proj';
  import { X, Share2, Check, ChevronDown, ChevronUp, ChevronRight, Clock, Image, Package, Navigation, Star, Info, Phone, Mail } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';

  import { selection } from '../stores/selection.js';
  import { fetchPlaygroundEquipment, fetchNearbyPOIs, fetchTrees, fetchMeta } from '../lib/api.js';
  import { overlayFeaturesStore } from '../stores/overlayLayer.js';
  import { groupEquipment } from '../lib/equipmentGrouping.js';
  import { playgroundCompleteness } from '../lib/completeness.js';
  import { poiRadiusM, appMode } from '../lib/config.js';
  import { getPlaygroundTitle, getPlaygroundLocation } from '../lib/playgroundHelpers.js';
  import { cn } from '../lib/utils.js';
  import EquipmentList from './EquipmentList.svelte';
  import MapCompleteLink from './MapCompleteLink.svelte';
  import POIPanel from './POIPanel.svelte';
  import PanoramaxViewer from './PanoramaxViewer.svelte';
  import ReviewsPanel from './ReviewsPanel.svelte';
  import Badge from './ui/Badge.svelte';
  import Button from './ui/Button.svelte';
  import AgeChip from './AgeChip.svelte';

  /** When true, renders without the fixed sidebar wrapper (for bottom sheet embedding) */
  export let embedded = false;

  // ── Derived state from selection store ────────────────────────────────────
  $: feature     = $selection.feature;
  $: backendUrl  = $selection.backendUrl;
  $: attr        = feature ? feature.getProperties() : null;
  $: backendName = appMode === 'hub' ? (feature?.get('_backendName') ?? null) : null;

  // ── Async data ────────────────────────────────────────────────────────────
  let equipmentFeatures = [];
  let equipmentGroups = [];
  let pois = [];
  let treeRows = [];
  let equipmentLoading = false;
  let poisLoading = false;

  // ── Backend metadata (data age) ───────────────────────────────────────────
  // metaCache is module-scoped (see <script context="module"> above) so the
  // get_meta() result survives the panel's per-selection remount cycle.
  let osmDataAgeSec = null;
  // Generation guard so a slow earlier loadMeta() can't overwrite a faster
  // later one when the user selects two playgrounds in quick succession.
  let metaGen = 0;

  async function loadMeta(url) {
    const gen = ++metaGen;
    if (!url) { osmDataAgeSec = null; return; }
    if (metaCache.has(url)) {
      if (gen === metaGen) osmDataAgeSec = metaCache.get(url);
      return;
    }
    try {
      const meta = await fetchMeta(url);
      // Prefer the user-facing OSM snapshot age; fall back to import-run age.
      const ageSec = meta?.osm_data_age_seconds ?? meta?.data_age_seconds ?? null;
      metaCache.set(url, ageSec);
      if (gen === metaGen) osmDataAgeSec = ageSec;
    } catch {
      // Don't cache failures — a transient network error must not permanently
      // hide the chip for this backend URL.
      if (gen === metaGen) osmDataAgeSec = null;
    }
  }

  function formatDataAge(sec) {
    if (!Number.isFinite(sec) || sec < 0) return null;
    if (sec < 60) return $_('hub.dataAgeJustNow');
    const m = Math.round(sec / 60);
    if (m < 60)   return $_('hub.dataAgeMinutes', { values: { m } });
    const h = Math.round(m / 60);
    if (h < 48)   return $_('hub.dataAgeHours',   { values: { h } });
    const d = Math.round(h / 24);
    if (d <= 365) return $_('hub.dataAgeDays',    { values: { d } });
    const y = Math.round(d / 365);
    return $_('hub.dataAgeYears', { values: { y } });
  }

  $: loadMeta(backendUrl);
  $: dataAgeFormatted = formatDataAge(osmDataAgeSec);
  // Close the popover when the user picks a different playground / backend
  // — the popover's body text references `dataAgeFormatted`, which would
  // otherwise show stale content next to the new title until the user
  // dismisses the popover.
  $: if (backendUrl !== undefined) dataAgePopoverOpen = false;

  // ── Data age popover ──────────────────────────────────────────────────────
  let dataAgePopoverOpen = false;
  let dataAgePopoverStyle = '';
  let chipEl;

  function recomputePopoverStyle() {
    if (!chipEl) return;
    const chip = chipEl.getBoundingClientRect();
    // Clamp right edge against the panel's right boundary; floor the width
    // so we never compute a zero/negative width on very narrow viewports.
    const panel = chipEl.closest('aside, [data-panel]');
    const panelRight = panel ? panel.getBoundingClientRect().right : window.innerWidth;
    const maxWidth = Math.max(140, Math.min(260, panelRight - chip.left - 12));
    dataAgePopoverStyle = [
      `top:${chip.bottom + 6}px`,
      `left:${chip.left}px`,
      `width:${maxWidth}px`,
    ].join(';');
  }

  function onDocumentClick(e) {
    // Don't close when the click is inside the popover (so users can select
    // text) or on the chip button itself (its own onclick handles toggle).
    if (e.target?.closest?.('.data-age-popover, .data-age-chip')) return;
    closeDataAgePopover();
  }
  function onPopoverKeydown(e) {
    if (e.key === 'Escape' && dataAgePopoverOpen) {
      // Stop propagation so the panel-level Escape handler doesn't also fire
      // and close the entire panel.
      e.stopPropagation();
      closeDataAgePopover();
    }
  }
  function onViewportChange() {
    // Scroll/resize/sheet-drag invalidate the fixed-position style. Cheaper
    // and less surprising to close than to chase the chip around the screen.
    closeDataAgePopover();
  }

  function openDataAgePopover() {
    recomputePopoverStyle();
    dataAgePopoverOpen = true;
    // Defer listener attachment by a tick so the click that opened the
    // popover doesn't immediately close it via document-level capture.
    setTimeout(() => {
      window.addEventListener('click', onDocumentClick);
      window.addEventListener('keydown', onPopoverKeydown);
      window.addEventListener('resize', onViewportChange);
      // capture: catches scroll on any ancestor (panel, bottom sheet, page)
      window.addEventListener('scroll', onViewportChange, true);
    }, 0);
  }

  function closeDataAgePopover() {
    if (!dataAgePopoverOpen) return;
    dataAgePopoverOpen = false;
    window.removeEventListener('click', onDocumentClick);
    window.removeEventListener('keydown', onPopoverKeydown);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
  }

  function toggleDataAgePopover(e) {
    e.stopPropagation();
    if (dataAgePopoverOpen) closeDataAgePopover();
    else                    openDataAgePopover();
  }

  // Centre of selected playground in WGS84
  let centerLat = 0, centerLon = 0;

  // Generation counter — incremented on each new selection so stale responses are discarded.
  let loadGen = 0;

  $: if (feature) {
    loadData(feature, backendUrl);
  } else {
    equipmentFeatures = [];
    equipmentGroups = [];
    pois = [];
    treeRows = [];
    overlayFeaturesStore.set({ equipment: [], trees: [] });
  }

  async function loadData(feat, url) {
    const geom = feat.getGeometry();
    if (!geom) { equipmentFeatures = []; pois = []; return; }

    const gen = ++loadGen;
    const ext = geom.getExtent();
    const [lon, lat] = transform(
      [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2],
      'EPSG:3857', 'EPSG:4326'
    );
    centerLat = lat;
    centerLon = lon;

    equipmentLoading = true;
    poisLoading = true;

    let localEquipment = [];
    let localTrees = [];

    try {
      const geojson = await fetchPlaygroundEquipment(ext, feat.get('osm_id'), url);
      if (gen === loadGen) {
        localEquipment = geojson.features ?? [];
        // Clear any leftover _groupId tags before re-stamping. The current
        // fetch path returns fresh objects per call so this is defensive,
        // but a future caching layer or a hub-mode merge that reuses
        // feature references would otherwise leak stale group membership
        // (and silently hide the dot for a now-standalone device).
        for (const f of localEquipment) {
          if (f.properties) delete f.properties._groupId;
        }
        const { groups, standalone } = groupEquipment(localEquipment);
        for (const { structure, children } of groups) {
          for (const child of children) {
            child.properties._groupId = structure.properties.osm_id;
          }
        }
        equipmentGroups = groups;
        equipmentFeatures = standalone;
      }
    } catch (err) {
      console.warn('[panel] Equipment load failed:', err);
      if (gen === loadGen) {
        equipmentFeatures = [];
        equipmentGroups = [];
        treeRows = [];
        // Clear stale equipment from the previous selection's overlay so
        // the map doesn't keep showing wrong dots on the new playground.
        overlayFeaturesStore.set({ equipment: [], trees: [] });
      }
    } finally {
      if (gen === loadGen) equipmentLoading = false;
    }

    try {
      const treeGeojson = await fetchTrees(ext, url);
      if (gen === loadGen) {
        localTrees = treeGeojson.features ?? [];
        treeRows = localTrees
          .filter(f => f.properties?.feature_type === 'tree_row' && f.properties?.length_m != null)
          .map(f => f.properties.length_m);
      }
    } catch (err) {
      // Trees silently ignored on error (e.g. Overpass/dev mode)
    }

    if (gen === loadGen) {
      overlayFeaturesStore.set({ equipment: localEquipment, trees: localTrees });
    }

    try {
      const result = await fetchNearbyPOIs(lat, lon, poiRadiusM, feat.get('osm_id'), url);
      if (gen === loadGen) pois = result;
    } catch (err) {
      console.warn('POI load failed:', err);
      if (gen === loadGen) pois = [];
    } finally {
      if (gen === loadGen) poisLoading = false;
    }
  }

  // ── ESC to close ──────────────────────────────────────────────────────────
  function handleKeydown(e) {
    if (e.key === 'Escape' && feature && !embedded) selection.clear();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    overlayFeaturesStore.set({ equipment: [], trees: [] });
    // Bail out cleanly if unmount happens while popover is open.
    closeDataAgePopover();
  });

  // ── Completeness badge ────────────────────────────────────────────────────
  const COMPLETENESS_VARIANT = {
    complete: 'success',
    partial:  'warning',
    missing:  'destructive',
  };
  const COMPLETENESS_KEY = {
    complete: 'completeness.badgeComplete',
    partial:  'completeness.badgePartial',
    missing:  'completeness.badgeMissing',
  };
  $: completenessLevel = attr ? playgroundCompleteness(attr) : null;
  $: completeness = completenessLevel
    ? { variant: COMPLETENESS_VARIANT[completenessLevel], key: COMPLETENESS_KEY[completenessLevel] }
    : null;

  // ── Opening hours ─────────────────────────────────────────────────────────
  function openingHoursState(ohStr, t) {
    const fmt = d => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const dayLabel = (d, now) => {
      if (d.toDateString() === now.toDateString()) return t('poi.today');
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      if (d.toDateString() === tomorrow.toDateString()) return t('poi.tomorrow');
      const diff = Math.round((d - now) / 86400000);
      if (diff <= 6) return d.toLocaleDateString(undefined, { weekday: 'long' });
      return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
    };
    try {
      const oh = new OpeningHours(ohStr, { address: { country_code: 'de' } });
      const now = new Date();
      const isOpen = oh.getState(now);
      const next = oh.getNextChange(now);
      if (ohStr.trim() === '24/7') return { open: true, text: t('poi.alwaysOpen') };
      if (isOpen) {
        const label = next
          ? t('poi.openUntil', { values: { time: fmt(next) } })
          : t('poi.open');
        return { open: true, text: label };
      }
      if (next) return {
        open: false,
        text: `${t('poi.closed')} · ${t('poi.opensAt', { values: { day: dayLabel(next, now), time: fmt(next) } })}`,
      };
      return { open: false, text: t('poi.closed') };
    } catch {
      return { open: null, text: ohStr };
    }
  }

  $: openingHoursInfo = attr?.opening_hours ? openingHoursState(attr.opening_hours, $_) : null;

  // ── Attribute helpers ─────────────────────────────────────────────────────
  $: accessLabel = (() => {
    if (!attr) return '';
    const privateVal = attr.private;
    if (privateVal === 'residents') return $_('details.access.residents');
    if (privateVal === 'students')  return $_('details.access.students');
    if (privateVal === 'employees') return $_('details.access.employees');
    const access = attr.access ?? 'unknown';
    return $_('details.access.' + access, { default: $_('details.access.unknown') });
  })();

  $: surfaceLabel = attr?.surface
    ? attr.surface.split(';').map(s => $_('details.surfaceValues.' + s.trim(), { default: s.trim() })).join(' / ')
    : null;

  $: descriptionParts = (() => {
    if (!attr) return [];
    const parts = [];
    const desc = attr['description:de'] && attr.description !== attr['description:de']
      ? (attr.description ? `${attr.description} | ${attr['description:de']}` : attr['description:de'])
      : attr.description;
    if (desc) parts.push(desc);
    if (attr.note) parts.push(`${attr.note}`);
    if (attr.fixme) parts.push(`${attr.fixme}`);
    return parts;
  })();

  $: mcOsmType = attr ? ({ W:'way', R:'relation', N:'node' }[attr.osm_type] ?? 'way') : 'way';
  $: mcUrl = attr ? `https://mapcomplete.org/playgrounds.html#${mcOsmType}/${attr.osm_id}` : '';

  // ── Accordion state ───────────────────────────────────────────────────────
  let openSections = new Set(['photos', 'equipment', 'pois']);
  function toggleSection(id) {
    const next = new Set(openSections);
    next.has(id) ? next.delete(id) : next.add(id);
    openSections = next;
  }

  // ── Panoramax UUIDs from OSM tags ─────────────────────────────────────────
  $: panoramaxUuids = (() => {
    if (!attr) return [];
    const uuids = [];
    if (attr['panoramax']) uuids.push(attr['panoramax']);
    for (let i = 1; i <= 9; i++) {
      const v = attr[`panoramax:${i}`];
      if (v) uuids.push(v);
    }
    return uuids;
  })();

  // ── Share button ──────────────────────────────────────────────────────────
  let shareConfirmed = false;
  let shareTimeout;

  async function sharePlayground() {
    if (!attr) return;
    const url = `${window.location.origin}${window.location.pathname}#${attr.osm_type}${attr.osm_id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: getPlaygroundTitle(attr, $_), url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        // fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      shareConfirmed = true;
      clearTimeout(shareTimeout);
      shareTimeout = setTimeout(() => { shareConfirmed = false; }, 2000);
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
    }
  }
</script>

{#if feature && attr}
  <aside class={cn(
    embedded ? '' : 'info-panel',
    embedded ? '' : 'lg:flex'
  )}>
    <!-- Header -->
    {#if !embedded}
      <div class="info-panel__header">
        <div class="flex-1 min-w-0">
          <h2 class="panel-title">{getPlaygroundTitle(attr, $_)}</h2>
          {#if getPlaygroundLocation(attr, $_)}
            <p class="text-sm text-muted-foreground mt-0.5">{getPlaygroundLocation(attr, $_)}</p>
          {/if}
          {#if backendName}
            <p class="backend-name">{backendName}</p>
          {/if}
          {#if completeness || dataAgeFormatted}
            <div class="flex items-center gap-2 flex-wrap mt-2">
              {#if completeness}
                <Badge variant={completeness.variant}>{$_(completeness.key)}</Badge>
              {/if}
              {#if dataAgeFormatted}
                <button
                  bind:this={chipEl}
                  class="data-age-chip"
                  onclick={toggleDataAgePopover}
                  title={$_('details.osmDataAgeTitle')}
                  aria-haspopup="dialog"
                  aria-controls="data-age-popover"
                  aria-expanded={dataAgePopoverOpen}
                >
                  <Info class="h-3 w-3" />
                  {$_('details.osmDataAgeChip', { values: { age: dataAgeFormatted } })}
                  {#if dataAgePopoverOpen}
                    <ChevronUp class="h-3 w-3" />
                  {:else}
                    <ChevronDown class="h-3 w-3" />
                  {/if}
                </button>
              {/if}
            </div>
          {/if}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button class="panel-icon-btn" onclick={() => selection.clear()} aria-label={$_('info.closeBtn')}>
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>
    {:else}
      <!-- Embedded header (mobile full-screen panel) -->
      <div class="flex items-start justify-between gap-2 mb-4">
        <div class="flex-1 min-w-0">
          <h2 class="panel-title">{getPlaygroundTitle(attr, $_)}</h2>
          {#if getPlaygroundLocation(attr, $_)}
            <p class="text-sm text-muted-foreground mt-0.5">{getPlaygroundLocation(attr, $_)}</p>
          {/if}
          {#if backendName}
            <p class="backend-name">{backendName}</p>
          {/if}
          {#if completeness || dataAgeFormatted}
            <div class="flex items-center gap-2 flex-wrap mt-2">
              {#if completeness}
                <Badge variant={completeness.variant}>{$_(completeness.key)}</Badge>
              {/if}
              {#if dataAgeFormatted}
                <button
                  bind:this={chipEl}
                  class="data-age-chip"
                  onclick={toggleDataAgePopover}
                  title={$_('details.osmDataAgeTitle')}
                  aria-haspopup="dialog"
                  aria-controls="data-age-popover"
                  aria-expanded={dataAgePopoverOpen}
                >
                  <Info class="h-3 w-3" />
                  {$_('details.osmDataAgeChip', { values: { age: dataAgeFormatted } })}
                  {#if dataAgePopoverOpen}
                    <ChevronUp class="h-3 w-3" />
                  {:else}
                    <ChevronDown class="h-3 w-3" />
                  {/if}
                </button>
              {/if}
            </div>
          {/if}
        </div>
        <button class="panel-icon-btn shrink-0" onclick={sharePlayground} aria-label={$_('info.copyLink')}>
          {#if shareConfirmed}
            <Check class="h-5 w-5 text-green-600" />
          {:else}
            <Share2 class="h-5 w-5" />
          {/if}
        </button>
      </div>
    {/if}

    <div class={cn(embedded ? '' : 'info-panel__body')}>
      <!-- Description -->
      {#each descriptionParts as part}
        <p class="text-sm text-muted-foreground italic mb-3">{part}</p>
      {/each}

      <!-- Opening Hours + Age -->
      {#if openingHoursInfo || attr.min_age || attr.max_age}
        <div class="status-row mb-4">
          {#if openingHoursInfo}
            <div class="status-pill" class:status-pill--open={openingHoursInfo.open} class:status-pill--closed={!openingHoursInfo.open}>
              <span class="status-dot" class:status-dot--open={openingHoursInfo.open} class:status-dot--closed={!openingHoursInfo.open}></span>
              <Clock class="h-3.5 w-3.5 shrink-0" />
              <span>{openingHoursInfo.text}</span>
            </div>
          {/if}
          {#if attr.min_age || attr.max_age}
            <AgeChip minAge={attr.min_age ? Number(attr.min_age) : null} maxAge={attr.max_age ? Number(attr.max_age) : null} />
          {/if}
        </div>
      {/if}

      <!-- Quick Facts Grid -->
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
        {#if attr.area > 0}
          <div class="fact-item">
            <span class="info-label">{$_('details.sizeLabel')}</span>
            <span class="fact-value">{Math.round(attr.area / 10) * 10 || attr.area} m²</span>
          </div>
        {/if}

        <div class="fact-item">
          <span class="info-label">{$_('details.accessLabel')}</span>
          <span class="fact-value">{accessLabel}</span>
        </div>

        {#if surfaceLabel}
          <div class="fact-item">
            <span class="info-label">{$_('details.surfaceLabel')}</span>
            <span class="fact-value">{surfaceLabel}</span>
          </div>
        {/if}

        {#if attr.tree_count > 0 || treeRows.length > 0}
          <div class="fact-item">
            <span class="info-label">{$_('details.treeShadow')}{treeRows.length > 0 ? ` (${treeRows.length})` : ''}</span>
            <span class="fact-value">
              {[
                attr.tree_count > 0 ? `${attr.tree_count} ${$_('hover.tagTrees')}` : null,
                treeRows.length > 0 ? treeRows.map(m => `${m} m`).join(', ') : null,
              ].filter(Boolean).join(' / ')}
            </span>
          </div>
        {/if}

      </div>

      <!-- Contact Info -->
      {#if attr['contact:email'] || attr.email || attr['contact:phone'] || attr.phone || attr.operator}
        <div class="mb-4">
          {#if attr.operator}
            <div class="fact-item mb-1" data-testid="operator-value">
              <span class="info-label">{$_('details.operatorLabel')}</span>
              {#if attr['operator:wikidata']}
                <a href="https://www.wikidata.org/wiki/{attr['operator:wikidata']}"
                   target="_blank" rel="noopener" class="fact-value text-primary hover:underline">{attr.operator}</a>
              {:else}
                <span class="fact-value">{attr.operator}</span>
              {/if}
            </div>
          {/if}
          {#if attr['contact:phone'] || attr.phone || attr['contact:email'] || attr.email}
            <div class="contact-row">
              {#if attr['contact:phone'] || attr.phone}
                {@const phone = attr['contact:phone'] || attr.phone}
                {#if /^\+?\d/.test(phone.trim())}
                  <a href="tel:{phone}" class="contact-link">
                    <Phone class="h-3.5 w-3.5 shrink-0" /><span>{phone}</span>
                  </a>
                {:else}
                  <span class="contact-link contact-link--plain">
                    <Phone class="h-3.5 w-3.5 shrink-0" /><span>{phone}</span>
                  </span>
                {/if}
              {/if}
              {#if attr['contact:email'] || attr.email}
                {@const email = attr['contact:email'] || attr.email}
                {#if email.includes('@') && !/^javascript:/i.test(email.trim())}
                  <a href="mailto:{email}" class="contact-link">
                    <Mail class="h-3.5 w-3.5 shrink-0" /><span>{email}</span>
                  </a>
                {:else}
                  <span class="contact-link contact-link--plain">
                    <Mail class="h-3.5 w-3.5 shrink-0" /><span>{email}</span>
                  </span>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- MapComplete edit link -->
      <div class="mb-3">
        <MapCompleteLink href={mcUrl} label={$_('popup.editInMapComplete')} />
      </div>

      <!-- Accordion Sections -->
      <div class="border-t border-border">
        <!-- Photos -->
        <div class="border-b border-border">
          <button
            class="section-btn"
            onclick={() => toggleSection('photos')}
          >
            {#if openSections.has('photos')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Image class="h-4 w-4 text-muted-foreground" />
            {$_('accordion.photos')}
          </button>
          {#if openSections.has('photos')}
            <div class="pb-3">
              <PanoramaxViewer uuids={panoramaxUuids} {mcUrl} />
            </div>
          {/if}
        </div>

        <!-- Equipment -->
        <div class="border-b border-border">
          <button
            class="section-btn"
            onclick={() => toggleSection('equipment')}
          >
            {#if openSections.has('equipment')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Package class="h-4 w-4 text-muted-foreground" />
            {$_('accordion.equipment')}
          </button>
          {#if openSections.has('equipment')}
            <div class="pb-3">
              {#if equipmentLoading}
                <p class="text-sm text-muted-foreground italic py-2">{$_('details.loading')}</p>
              {:else}
                <EquipmentList features={equipmentFeatures} groups={equipmentGroups} playgroundAttr={attr} />
              {/if}
            </div>
          {/if}
        </div>

        <!-- POIs -->
        <div class="border-b border-border">
          <button
            class="section-btn"
            onclick={() => toggleSection('pois')}
          >
            {#if openSections.has('pois')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Navigation class="h-4 w-4 text-muted-foreground" />
            {$_('accordion.surroundings')}
          </button>
          {#if openSections.has('pois')}
            <div class="pb-3">
              {#if poisLoading}
                <p class="text-sm text-muted-foreground italic py-2">{$_('details.loading')}</p>
              {:else}
                <POIPanel {pois} {centerLat} {centerLon} />
              {/if}
            </div>
          {/if}
        </div>

        <!-- Reviews -->
        <div class="border-b border-border">
          <button
            class="section-btn"
            onclick={() => toggleSection('reviews')}
          >
            {#if openSections.has('reviews')}
              <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
            <Star class="h-4 w-4 text-muted-foreground" />
            {$_('accordion.reviews')}
          </button>
          {#if openSections.has('reviews')}
            <div class="pb-3">
              <ReviewsPanel lat={centerLat} lon={centerLon} osmId={attr?.osm_id} />
            </div>
          {/if}
        </div>
      </div>
    </div>
  </aside>
{/if}

{#if dataAgePopoverOpen && dataAgeFormatted}
  <div
    id="data-age-popover"
    class="data-age-popover"
    style={dataAgePopoverStyle}
    role="dialog"
    aria-labelledby="data-age-popover-title"
  >
    <p id="data-age-popover-title" class="data-age-popover__title">{$_('details.osmDataAgeTitle')}</p>
    <p class="data-age-popover__body">
      {$_('details.osmDataAgeBody', { values: { age: dataAgeFormatted } })}
    </p>
  </div>
{/if}

<style>
  .info-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: 380px;
    height: 100%;
    background: #ffffff;
    box-shadow: 4px 0 15px -3px rgb(0 0 0 / 0.1);
    z-index: 100;
    overflow-y: auto;
    display: none;
    flex-direction: column;
    border-right: 1px solid #e5e7eb;
    touch-action: pan-y;
    color-scheme: light;

    /* Force light theme variables */
    --color-background: #ffffff;
    --color-foreground: #1f2937;
    --color-card: #ffffff;
    --color-card-foreground: #1f2937;
    --color-popover: #ffffff;
    --color-popover-foreground: #1f2937;
    --color-muted: #f3f4f6;
    --color-muted-foreground: #6b7280;
    --color-border: #e5e7eb;
    --color-input: #e5e7eb;
  }

  .info-panel.lg\:flex {
    display: flex;
  }

  .info-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    background: #ffffff;
    z-index: 1;
  }

  .info-panel__body {
    padding: 1rem;
    flex: 1;
  }

  @media (max-width: 1023px) {
    .info-panel {
      display: none !important;
    }
  }

  /* ── Typography ───────────────────────────────────────────────────────── */

  .panel-title {
    font-size: 17px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.3;
    margin: 0;
  }


  .info-label {
    display: block;
    color: #9ca3af;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .fact-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .fact-value {
    font-size: 13px;
    color: #1f2937;
  }

  .section-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    transition: color 0.15s, background 0.15s;
    text-align: left;
  }

  .section-btn:hover {
    color: #374151;
    background: #fafafa;
  }

  .panel-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: none;
    background: transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    color: #6b7280;
    transition: background 0.15s, color 0.15s;
  }

  .panel-icon-btn:hover {
    background: #f3f4f6;
    color: #1f2937;
  }

  /* ── Action row ─────────────────────────────────────── */
  .action-row {
    display: flex;
    gap: 8px;
    padding: 10px 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: none;
    border-radius: 9px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s, opacity 0.15s;
  }

  .action-btn--primary {
    flex: 1;
    padding: 10px 0;
    background: #10b981;
    color: #fff;
  }
  .action-btn--primary:hover { background: #059669; }

  .action-btn--icon {
    width: 44px;
    height: 44px;
    background: #f3f4f6;
    color: #6b7280;
    border: 1px solid #e5e7eb;
  }
  .action-btn--icon:hover { background: #e5e7eb; color: #1f2937; }

  /* ── Contact row (phone + email inline) ─────────────── */
  .contact-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .contact-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: #10b981;
    text-decoration: none;
    min-width: 0;
  }
  .contact-link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contact-link:hover { text-decoration: underline; }
  .contact-link--plain { color: #1f2937; cursor: default; }
  .contact-link--plain:hover { text-decoration: none; }

  /* ── Status row (opening hours + age chip) ──────────── */
  .status-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
  }
  .status-pill span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status-pill--open   { background: #ecfdf5; border: 1px solid rgba(16, 185, 129, 0.4); color: #065f46; }
  .status-pill--closed { background: #fef2f2; border: 1px solid rgba(239, 68, 68, 0.4);  color: #b91c1c; }

  .status-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }
  .status-dot--open   { background: #10b981; }
  .status-dot--closed { background: #ef4444; }


  /* ── Stat cards grid ─────────────────────────────── */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 10px 12px;
  }

  .stat-value {
    font-size: 15px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 10px;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .backend-name {
    margin: 0.15rem 0 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #9ca3af;
  }

  /* ── Data-age chip + fixed popover ──────────────────────────────────── */
  .data-age-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 600;
    color: #6b7280;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    line-height: 1.4;
  }

  .data-age-chip:hover,
  .data-age-chip[aria-expanded="true"] {
    background: #e5e7eb;
    color: #374151;
  }

  /* Rendered outside the aside so overflow-y: auto can't clip it. */
  :global(.data-age-popover) {
    position: fixed;
    z-index: 500;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    padding: 10px 12px;
  }

  :global(.data-age-popover__title) {
    font-size: 10px;
    font-weight: 700;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 4px;
  }

  :global(.data-age-popover__body) {
    font-size: 12px;
    color: #6b7280;
    line-height: 1.5;
    margin: 0;
  }
</style>
