<script>
  import { filterStore, hasActiveFilters, activeFilterCount, defaultFilters } from '../stores/filters.js';
  import { _ } from 'svelte-i18n';
  import { Filter, Droplets, Baby, Accessibility, Armchair, UtensilsCrossed, Home, RectangleHorizontal, Goal, CircleDot, Lock, Layers, BarChart3 } from 'lucide-svelte';

  let open = false;
  let wrap;

  function onWindowClick(e) {
    if (open && wrap && !e.composedPath().includes(wrap)) open = false;
  }

  const FILTER_ICONS = {
    private:     Lock,
    water:       Droplets,
    baby:        Baby,
    toddler:     Baby,
    wheelchair:  Accessibility,
    bench:       Armchair,
    picnic:      UtensilsCrossed,
    shelter:     Home,
    tableTennis: RectangleHorizontal,
    soccer:      Goal,
    basketball:  CircleDot,
  };

  $: FILTERS = Object.entries(FILTER_ICONS).map(([key, icon]) => ({
    key,
    label: $_('filter.labels.' + key),
    icon,
  }));

  $: active = hasActiveFilters($filterStore);
  $: activeCount = activeFilterCount($filterStore);

  const COMPLETENESS_STATES = ['showComplete', 'showPartial', 'showMissing'];

  function toggle(key) {
    filterStore.update(f => ({ ...f, [key]: !f[key] }));
  }

  function clearAll() {
    filterStore.set({ ...defaultFilters });
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="filter-container" bind:this={wrap}>
  <button
    class="control-btn"
    class:active
    onclick={() => open = !open}
    title={$_('filter.title')}
    aria-label={$_('filter.title')}
    aria-expanded={open}
  >
    <Filter class="h-5 w-5" />
    {#if active}
      <span class="badge">{activeCount}</span>
    {/if}
  </button>

  {#if open}
    <div class="filter-dropdown">
      <div class="dropdown-header">
        <span class="dropdown-title">{$_('filter.title')}</span>
        {#if active}
          <button class="clear-btn" onclick={clearAll}>
            {$_('filter.clearAll')}
          </button>
        {/if}
      </div>

      <div class="filter-list">
        {#each FILTERS as f}
          <label class="filter-item" class:checked={$filterStore[f.key]}>
            <input
              type="checkbox"
              checked={$filterStore[f.key]}
              onchange={() => toggle(f.key)}
            />
            <svelte:component this={f.icon} class="h-4 w-4" />
            <span>{f.label}</span>
          </label>
        {/each}
      </div>

      <div class="completeness-section">
        <span class="layer-title"><BarChart3 class="h-3 w-3" /> {$_('filter.completeness.title')}</span>
        {#each COMPLETENESS_STATES as key}
          <label class="filter-item" class:completeness-hidden={!$filterStore[key]}>
            <input
              type="checkbox"
              checked={$filterStore[key]}
              onchange={() => toggle(key)}
            />
            <span class="completeness-dot {key}-dot"></span>
            <span>{$_('filter.completeness.' + key)}</span>
          </label>
        {/each}
      </div>

      <div class="layer-section">
        <span class="layer-title"><Layers class="h-3 w-3" /> {$_('filter.layers')}</span>
        <label class="filter-item" class:checked={$filterStore.standalonePitches}>
          <input
            type="checkbox"
            checked={$filterStore.standalonePitches}
            onchange={() => toggle('standalonePitches')}
          />
          <Goal class="h-4 w-4" />
          <span>{$_('filter.standalonePitches')}</span>
        </label>
      </div>
    </div>
  {/if}
</div>

<style>
  .filter-container {
    position: relative;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
    position: relative;
  }

  .control-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .control-btn.active {
    background: #e8f5e9;
    color: #1b5e20;
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    font-size: 11px;
    font-weight: 600;
    background: #1b5e20;
    color: white;
    border-radius: 9px;
  }

  .filter-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    min-width: 260px;
    z-index: 300;
    animation: fadeIn 0.15s ease-out;
    overflow: hidden;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e8eaed;
  }

  .dropdown-title {
    font-size: 14px;
    font-weight: 600;
    color: #202124;
  }

  .clear-btn {
    font-size: 12px;
    color: #1a73e8;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .clear-btn:hover {
    text-decoration: underline;
  }

  .filter-list {
    padding: 8px 0;
    max-height: 320px;
    overflow-y: auto;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 14px;
    color: #5f6368;
    transition: background 0.15s;
  }

  .filter-item:hover {
    background: #f1f3f4;
  }

  .filter-item.checked {
    background: #e8f5e9;
    color: #1b5e20;
  }

  .filter-item input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #1b5e20;
    cursor: pointer;
  }

  .completeness-section {
    border-top: 1px solid #e8eaed;
    padding-top: 4px;
  }

  .completeness-dot {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 2px solid;
    flex-shrink: 0;
  }

  .showComplete-dot { border-color: #155215; background: rgba(21, 82, 21, 0.15); }
  .showPartial-dot  { border-color: #92400e; background: rgba(146, 64, 14, 0.15); }
  .showMissing-dot  { border-color: #991b1b; background: rgba(153, 27, 27, 0.15); }

  .filter-item.completeness-hidden {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .layer-section {
    border-top: 1px solid #e8eaed;
    padding-top: 4px;
  }

  .layer-title {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #80868b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 16px 2px;
  }
</style>
