<script>
  import { objDevices, objFitnessStation } from '../lib/objPlaygroundEquipment.js';
  import { objColors } from '../lib/vectorStyles.js';
  import { getEquipmentAttributesFromProps } from '../lib/equipmentAttributes.js';
  import { _ } from 'svelte-i18n';
  import MapCompleteLink from './MapCompleteLink.svelte';
  import PanoramaxViewer from './PanoramaxViewer.svelte';

  /** @type {Array} GeoJSON features from fetchPlaygroundEquipment (standalone only) */
  export let features = [];
  /** @type {Array<{structure: Object, children: Object[]}>} Grouped structure entries */
  export let groups = [];
  /** @type {Object} Playground polygon properties (for playground:<key> fallback) */
  export let playgroundAttr = {};

  // osm2pgsql emits one row per outer ring for multipolygon features, so the
  // same osm_id can appear multiple times in the API response.  Deduplicate
  // before filtering to prevent the same pitch/device from rendering twice.
  $: uniqueFeatures = features.filter(
    (f, idx, arr) => arr.findIndex(g => g.properties.osm_id === f.properties.osm_id) === idx
  );

  // Summary counts include grouped children — a structure with 3 swings is
  // still 3 swings as far as the user is concerned. The detail rendering
  // continues to show standalone-only `uniqueFeatures` so groups don't double-list.
  $: countSource = [...uniqueFeatures, ...groups.flatMap(g => g.children)];
  $: deviceFeatures  = uniqueFeatures.filter(f => f.properties.playground && f.properties.playground !== 'yes');
  $: fitnessFeatures = uniqueFeatures.filter(f => f.properties.leisure === 'fitness_station');
  $: pitchFeatures   = uniqueFeatures.filter(f => f.properties.leisure === 'pitch');
  $: deviceCount  = countSource.filter(f => f.properties.playground && f.properties.playground !== 'yes' && f.properties.playground !== 'structure').length;
  $: fitnessCount = countSource.filter(f => f.properties.leisure === 'fitness_station').length;
  $: pitchCount   = countSource.filter(f => f.properties.leisure === 'pitch').length;
  $: benchCount   = countSource.filter(f => f.properties.amenity === 'bench').length;
  $: shelterCount = countSource.filter(f => f.properties.amenity === 'shelter').length;
  $: picnicCount  = countSource.filter(f => f.properties.leisure === 'picnic_table').length;

  // Fallback: playground:<key>=<count|yes> on the polygon itself
  $: fallbackCounts = (() => {
    if (deviceFeatures.length) return {};
    const counts = {};
    for (const [tag, val] of Object.entries(playgroundAttr)) {
      if (!tag.startsWith('playground:')) continue;
      const key = tag.replace('playground:', '');
      const n = parseInt(val) || (val === 'yes' ? 1 : 0);
      if (n > 0) counts[key] = n;
    }
    return counts;
  })();

  // Open/closed state per item (keyed by osm_id or random uid)
  let openItems = new Set();
  function toggleItem(id) {
    const next = new Set(openItems);
    next.has(id) ? next.delete(id) : next.add(id);
    openItems = next;
  }
  function uid(f) {
    return `dev-${f.properties.osm_id ?? Math.random().toString(36).slice(2)}`;
  }

  // Group features by type key; flag groups with > 2 items for collapsed rendering.
  function groupByType(feats, keyFn) {
    const map = new Map();
    for (const f of feats) {
      const k = keyFn(f);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f);
    }
    return [...map.values()].map(items => ({ items, collapsed: items.length >= 2 }));
  }

  // Collect all deduped panoramax UUIDs from a list of features.
  function collectUuids(feats) {
    const uuids = [];
    const seen = new Set();
    for (const f of feats) {
      for (let i = 0; i <= 9; i++) {
        const key = i === 0 ? 'panoramax' : `panoramax:${i}`;
        const v = f.properties[key];
        if (v && !seen.has(v)) { seen.add(v); uuids.push(v); }
      }
    }
    return uuids;
  }

  $: devicesByType  = groupByType(deviceFeatures,  f => f.properties.playground);
  $: fitnessByType  = groupByType(fitnessFeatures, () => 'fitness_station');

  // Collect ALL panoramax UUIDs for a structure group (structure first, then
  // children) — keep every `panoramax:N` key per feature, not just the first,
  // and dedup across the group so a UUID copied to both parent and child
  // doesn't render twice.
  function groupUuids({ structure, children }) {
    const uuids = [];
    const seen = new Set();
    const push = props => {
      for (let i = 0; i <= 9; i++) {
        const key = i === 0 ? 'panoramax' : `panoramax:${i}`;
        const v = props[key];
        if (v && !seen.has(v)) {
          seen.add(v);
          uuids.push(v);
        }
      }
    };
    push(structure.properties);
    for (const child of children) push(child.properties);
    return uuids;
  }

  // Panoramax fullscreen modal for device photos
  let modalUuid = null;
  const thumbUrl  = uuid => `https://api.panoramax.xyz/api/pictures/${uuid}/thumb.jpg`;
  const viewerUrl = uuid => `https://api.panoramax.xyz/?pic=${uuid}&nav=none&focus=pic`;
</script>

{#if features.length === 0 && groups.length === 0 && Object.keys(fallbackCounts).length === 0}
  <ul><li><small class="text-muted">{$_('equipment.noDevices')}</small></li></ul>
  <p class="text-muted mt-2 mb-0" style="font-size:smaller">
    {@html $_('equipment.mapcompleteHint', { values: { link: '<a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener">MapComplete</a>' } })}
  </p>
{:else}
  <!-- Summary counts (count includes grouped children, so a structure with
       3 swings shows "3 swings" rather than "0 swings + 1 structure group"). -->
  <ul class="summary-list">
    {#if deviceCount}
      <li>{$_('equipment.deviceCount', { values: { count: deviceCount } })}</li>
    {/if}
    {#if fitnessCount}
      <li>{$_('equipment.fitnessCount', { values: { count: fitnessCount } })}</li>
    {/if}
    {#if benchCount}
      <li>{$_('equipment.benches', { values: { count: benchCount } })}</li>
    {/if}
    {#if shelterCount}
      <li>{$_('equipment.shelters', { values: { count: shelterCount } })}</li>
    {/if}
    {#if picnicCount}
      <li>{$_('equipment.picnic', { values: { count: picnicCount } })}</li>
    {/if}
  </ul>

  <!-- Structure groups (playground=structure polygon containers) -->
  {#if groups.length}
    <ul class="mb-0 device-list">
      {#each groups as group (group.structure.properties.osm_id)}
        {@const structName = group.structure.properties.name || $_('equipment.devices.structure')}
        {@const structColor = objColors['structure_parts'] ?? objColors['fallback']}
        {@const groupId = `grp-${group.structure.properties.osm_id}`}
        {@const detailId = `detail-${groupId}`}
        {@const uuids = groupUuids(group)}
        {@const structDetail = getEquipmentAttributesFromProps(group.structure.properties, $_)}
        <!--
          When the structure has no own panoramax photo and there are
          aggregated photos from children, `structDetail.html` is the
          wikipedia-fallback image (see equipmentAttributes.js: the fallback
          is emitted only when there's neither attributes nor a photo). The
          aggregated PanoramaxViewer above already covers the photo slot,
          so we suppress that fallback to avoid a duplicate empty-state UI.
          When the html starts with `<ul>` it's real attribute content; keep it.
        -->
        {@const showStructHtml = structDetail.html && (
          structDetail.html.startsWith('<ul>') ||
          (uuids.length === 0 && !structDetail.panoramaxUuid)
        )}
        <li>
          <button
            type="button"
            class="device-toggle"
            onclick={() => toggleItem(groupId)}
            aria-expanded={openItems.has(groupId)}
            aria-controls={detailId}
          >
            <span style="color:{structColor}">●</span> {structName}
            <span class="group-badge">{$_('equipment.groupParts', { values: { count: group.children.length } })}</span>
            <span class="bi {openItems.has(groupId) ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron" aria-hidden="true"></span>
          </button>
          {#if openItems.has(groupId)}
            <div class="device-detail" id={detailId}>
              <PanoramaxViewer {uuids} mcUrl={structDetail.mcUrl} />
              {#if showStructHtml}
                {@html structDetail.html}
              {/if}
              <ul class="group-children">
                {#each group.children as child (child.properties.osm_id)}
                  {@const childKey = child.properties.playground}
                  {@const childName = childKey
                    ? $_('equipment.devices.' + childKey, { default: childKey })
                    : '?'}
                  {@const childCat = childKey ? (objDevices[childKey]?.category ?? 'fallback') : 'fallback'}
                  {@const childColor = objColors[childCat] ?? objColors['fallback']}
                  <li><span style="color:{childColor}">◦</span> {childName}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Detailed device list (mapped individually) -->
  {#if deviceFeatures.length || fitnessFeatures.length || pitchFeatures.length}
    <ul class="mb-0 device-list">
      {#each devicesByType as { items, collapsed } (items[0].properties.playground)}
        {@const key = items[0].properties.playground}
        {@const name = $_('equipment.devices.' + key, { default: objDevices[key]?.name_de ?? key })}
        {@const cat = objDevices[key]?.category ?? 'fallback'}
        {@const color = objColors[cat] ?? objColors['fallback']}
        {#if collapsed}
          {@const groupId = `type-${key}`}
          {@const uuids = collectUuids(items)}
          {@const firstDetail = getEquipmentAttributesFromProps(items[0].properties, $_)}
          <li>
            <button type="button" class="device-toggle" onclick={() => toggleItem(groupId)}
              aria-expanded={openItems.has(groupId)}>
              <span style="color:{color}">●</span> <span class="item-count">{items.length}×</span> {name}
              <span class="bi {openItems.has(groupId) ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
            </button>
            {#if openItems.has(groupId)}
              <div class="device-detail">
                {#if uuids.length}
                  <PanoramaxViewer {uuids} mcUrl={firstDetail.mcUrl} />
                {/if}
                {#each items as f (f.properties.osm_id)}
                  {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
                  {#if !detail.panoramaxUuid}
                    <MapCompleteLink href={detail.mcUrl} label={$_('popup.addPhoto')} />
                  {/if}
                {/each}
              </div>
            {/if}
          </li>
        {:else}
          {#each items as f (f.properties.osm_id)}
            {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
            {@const id = uid(f)}
            <li>
              {#if detail.html || detail.panoramaxUuid}
                <button type="button" class="device-toggle" onclick={() => toggleItem(id)}>
                  <span style="color:{color}">●</span> {name}
                  <span class="bi {openItems.has(id) ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
                </button>
                {#if openItems.has(id)}
                  <div class="device-detail">
                    {#if detail.panoramaxUuid}
                      <button type="button" class="photo-thumb-btn" onclick={() => modalUuid = detail.panoramaxUuid} title={$_('popup.devicePhoto')}>
                        <img src={thumbUrl(detail.panoramaxUuid)} alt={$_('modal.streetPhoto')} class="photo-thumb" />
                        <span class="photo-label"><span class="bi bi-camera"></span> {$_('popup.devicePhoto')}</span>
                      </button>
                    {:else}
                      <MapCompleteLink href={detail.mcUrl} label={$_('popup.addPhoto')} />
                    {/if}
                    {@html detail.html}
                  </div>
                {/if}
              {:else}
                <span style="color:{color}">●</span> {name}
              {/if}
            </li>
          {/each}
        {/if}
      {/each}

      {#each fitnessByType as { items, collapsed } ('fitness_station')}
        {@const color = objColors['activity'] ?? objColors['fallback']}
        {#if collapsed}
          {@const uuids = collectUuids(items)}
          {@const firstDetail = getEquipmentAttributesFromProps(items[0].properties, $_)}
          <li>
            <button type="button" class="device-toggle" onclick={() => toggleItem('fit-group')}
              aria-expanded={openItems.has('fit-group')}>
              <span style="color:{color}">●</span> <span class="item-count">{items.length}×</span> {$_('equipment.fitnessDefault')}
              <span class="bi {openItems.has('fit-group') ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
            </button>
            {#if openItems.has('fit-group')}
              <div class="device-detail">
                {#if uuids.length}
                  <PanoramaxViewer {uuids} mcUrl={firstDetail.mcUrl} />
                {/if}
                {#each items as f (f.properties.osm_id)}
                  {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
                  {#if !detail.panoramaxUuid}
                    <MapCompleteLink href={detail.mcUrl} label={$_('popup.addPhoto')} />
                  {/if}
                {/each}
              </div>
            {/if}
          </li>
        {:else}
          {#each items as f (f.properties.osm_id)}
            {@const fsType = f.properties.fitness_station}
            {@const name = fsType
              ? $_('equipment.fitness.' + fsType, { default: objFitnessStation[fsType] ?? $_('equipment.fitnessDefault') })
              : $_('equipment.fitnessDefault')}
            {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
            {@const id = uid(f)}
            <li>
              {#if detail.html || detail.panoramaxUuid}
                <button type="button" class="device-toggle" onclick={() => toggleItem(id)}>
                  <span style="color:{color}">●</span> {name}
                  <span class="bi {openItems.has(id) ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
                </button>
                {#if openItems.has(id)}
                  <div class="device-detail">
                    {#if detail.panoramaxUuid}
                      <button type="button" class="photo-thumb-btn" onclick={() => modalUuid = detail.panoramaxUuid} title={$_('popup.devicePhoto')}>
                        <img src={thumbUrl(detail.panoramaxUuid)} alt={$_('modal.streetPhoto')} class="photo-thumb" />
                        <span class="photo-label"><span class="bi bi-camera"></span> {$_('popup.devicePhoto')}</span>
                      </button>
                    {:else}
                      <MapCompleteLink href={detail.mcUrl} label={$_('popup.addPhoto')} />
                    {/if}
                    {@html detail.html}
                  </div>
                {/if}
              {:else}
                <span style="color:{color}">●</span> {name}
              {/if}
            </li>
          {/each}
        {/if}
      {/each}

      {#if pitchFeatures.length}
        <li>
          <button type="button" class="device-toggle" onclick={() => toggleItem('pitches')}
            aria-expanded={openItems.has('pitches')}>
            <span style="color:{objColors['fallback']}">●</span>
            <span class="item-count">{pitchFeatures.length}×</span>
            {$_('equipment.pitchDefault')}
            <span class="bi {openItems.has('pitches') ? 'bi-chevron-up' : 'bi-chevron-down'} device-chevron"></span>
          </button>
          {#if openItems.has('pitches')}
            <ul class="group-children">
              {#each pitchFeatures as f (f.properties.osm_id)}
                {@const sports = (f.properties.sport ?? '').split(';').map(s => s.trim()).filter(Boolean)}
                {@const label = sports.length
                  ? sports.map(s => $_('equipment.pitches.' + s, { default: s })).join(' / ')
                  : $_('equipment.pitchDefault')}
                {@const detail = getEquipmentAttributesFromProps(f.properties, $_)}
                <li class="pitch-sub">
                  <span class="pitch-sub-row">
                    <span style="color:{objColors['fallback']}">◦</span>
                    {label}
                    <MapCompleteLink href={detail.mcUrl} label="" />
                  </span>
                  {#if detail.panoramaxUuid}
                    <button type="button" class="pitch-photo-btn" onclick={() => modalUuid = detail.panoramaxUuid} title={$_('popup.devicePhoto')}>
                      <img src={thumbUrl(detail.panoramaxUuid)} alt={$_('modal.streetPhoto')} class="pitch-photo-thumb" />
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/if}
    </ul>

  <!-- Fallback: playground:<key> tags on the polygon itself -->
  {:else if Object.keys(fallbackCounts).length}
    <ul class="mb-0">
      {#each Object.entries(fallbackCounts) as [key, count]}
        {@const name = $_('equipment.devices.' + key, { default: objDevices[key]?.name_de ?? key })}
        {@const cat  = objDevices[key]?.category ?? 'fallback'}
        {@const color = objColors[cat] ?? objColors['fallback']}
        <li>
          <span style="color:{color}">●</span>
          {#if count > 1}<span class="item-count">{count}×</span> {/if}{name}
        </li>
      {/each}
    </ul>
    <p class="text-muted mt-2 mb-0" style="font-size:smaller">
      {@html $_('equipment.mapcompleteHint', { values: { link: '<a href="https://mapcomplete.org/playgrounds.html" target="_blank" rel="noopener">MapComplete</a>' } })}
    </p>
  {/if}
{/if}

{#if modalUuid}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="photo-modal-backdrop" onclick={() => modalUuid = null}>
    <div class="photo-modal" onclick={e => e.stopPropagation()}
         role="dialog" aria-modal="true" aria-label={$_('popup.devicePhoto')} tabindex="-1">
      <div class="photo-modal-header">
        <span class="photo-modal-title">{$_('popup.devicePhoto')}</span>
        <button type="button" class="btn-close" onclick={() => modalUuid = null} aria-label={$_('info.closeBtn')}></button>
      </div>
      <iframe
        src={viewerUrl(modalUuid)}
        style="width:100%; flex:1; border:none;"
        title={$_('popup.devicePhoto')}
        allowfullscreen
      ></iframe>
    </div>
  </div>
{/if}

<style>
  .group-badge {
    font-size: 0.72rem;
    color: #6b7280;
    margin-left: 0.3rem;
  }
  .item-count {
    font-size: 0.72rem;
    color: #6b7280;
  }
  .group-children {
    list-style: none;
    padding-left: 0.8rem;
    margin: 0.25rem 0 0;
    font-size: smaller;
    color: #374151;
  }
  .group-children li { margin-bottom: 0.15rem; }
  .pitch-sub-row { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .pitch-photo-btn {
    display: block;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    margin-top: 0.2rem;
    margin-left: 0.9rem;
  }
  .pitch-photo-btn:hover .pitch-photo-thumb { opacity: 0.85; }
  .pitch-photo-thumb {
    width: 100%;
    max-width: 120px;
    aspect-ratio: 16/9;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }
  .summary-list { font-size: 13px; color: #1f2937; }
  .device-list { padding-left: 0; list-style: none; font-size: 13px; color: #1f2937; }
  .device-list li { margin-bottom: 0.25rem; }
  .device-toggle { cursor: pointer; user-select: none; }
  .device-toggle:hover { text-decoration: underline; }
  .device-chevron { font-size: 0.7rem; margin-left: 0.25rem; }
  .device-detail {
    margin: 0.25rem 0 0.5rem 1rem;
    font-size: smaller;
  }
  .device-detail :global(ul) { padding-left: 1.2rem; margin-bottom: 0; }
  .device-detail :global(img) { width: 100%; border-radius: 4px; margin-bottom: 0.25rem; }

  .photo-thumb-btn {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    margin-bottom: 0.25rem;
  }
  .photo-thumb {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }
  .photo-thumb-btn:hover .photo-thumb { opacity: 0.85; }
  .photo-label {
    display: block;
    font-size: 0.75rem;
    color: #6c757d;
    margin-top: 2px;
  }

  .photo-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .photo-modal {
    background: #fff;
    border-radius: 6px;
    width: min(90vw, 1100px);
    height: min(80vh, 700px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .photo-modal-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #dee2e6;
    gap: 0.5rem;
  }
  .photo-modal-title {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 600;
  }
</style>
