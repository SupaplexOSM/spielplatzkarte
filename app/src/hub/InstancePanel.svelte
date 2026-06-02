<script>
  import { _ } from 'svelte-i18n';
  import { onDestroy } from 'svelte';
  import { Globe, AlertTriangle } from 'lucide-svelte';
  import InstancePanelDrawer from './InstancePanelDrawer.svelte';

  /** @type {import('svelte/store').Readable<Array>} */
  export let backends;
  /** @type {import('svelte/store').Readable<string|null>} */
  export let registryError;
  /** @type {import('svelte/store').Readable<Map<string,string[]>>} */
  export let overlapWarnings;

  let open = false;
  let pillEl;
  let wrapperEl;

  // Reachable = backend responded without error and isn't still loading. Drives
  // both the region count in the pill and the zero-reachable messaging.
  $: reachable = $backends.filter(b => !b.error && !b.loading);
  $: regionCount = reachable.length;
  // Total playgrounds across reachable backends. Sourced from each backend's
  // `playgroundCount` (from `get_meta`, region-wide total) since the hub
  // orchestrator no longer eagerly loads every backend's polygons; it
  // fetches the per-tier RPCs on moveend instead.
  $: playgroundCount = reachable.reduce((acc, b) => acc + (b.playgroundCount || 0), 0);
  $: isLoading = !$registryError && $backends.length === 0;
  $: hasRegistryError = !!$registryError;

  // Fractional progress while the first load is still in flight. `completed`
  // counts every backend that has settled (success or error) so the fraction
  // grows monotonically; errors still surface per-row in the drawer.
  //
  // `firstLoadSettled` is a one-way latch: once every backend has settled once,
  // we never re-enter the progress state. Without it the 5-min refresh poll
  // (which re-sets `loading: true`) would briefly flash the fraction every
  // tick, which looks broken.
  let firstLoadSettled = false;
  $: completedCount = $backends.filter(b => !b.loading).length;
  $: totalCount = $backends.length;
  $: if (totalCount > 0 && completedCount === totalCount) firstLoadSettled = true;
  $: showProgress = !firstLoadSettled
                 && !hasRegistryError
                 && !isLoading
                 && totalCount > 0
                 && completedCount < totalCount;

  function toggle() {
    open = !open;
  }

  function close() {
    if (!open) return;
    open = false;
    // Return focus to the pill so keyboard users aren't stranded.
    pillEl?.focus();
  }

  function handleDocKey(e) {
    if (e.key === 'Escape') close();
  }

  function handleDocClick(e) {
    if (!open) return;
    if (wrapperEl && !wrapperEl.contains(e.target)) close();
  }

  $: if (typeof document !== 'undefined') {
    if (open) {
      document.addEventListener('keydown', handleDocKey);
      document.addEventListener('mousedown', handleDocClick);
    } else {
      document.removeEventListener('keydown', handleDocKey);
      document.removeEventListener('mousedown', handleDocClick);
    }
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleDocKey);
      document.removeEventListener('mousedown', handleDocClick);
    }
  });
</script>

<div class="panel" bind:this={wrapperEl}>
  {#if open}
    <div class="panel__drawer">
      <InstancePanelDrawer
        backends={$backends}
        registryError={$registryError}
        overlapWarnings={$overlapWarnings}
        onclose={close}
      />
    </div>
  {/if}

  <button
    class="pill"
    class:pill--error={hasRegistryError}
    class:pill--loading={isLoading || showProgress}
    type="button"
    onclick={toggle}
    aria-expanded={open}
    aria-busy={isLoading || showProgress}
    aria-label={open ? $_('hub.pillCollapse') : $_('hub.pillExpand')}
    bind:this={pillEl}
  >
    {#if hasRegistryError}
      <AlertTriangle class="pill__icon" aria-hidden="true" />
      <span class="pill__text">{$_('hub.registryError')}</span>
    {:else if isLoading}
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span class="pill__text">{$_('hub.loading')}</span>
    {:else if showProgress}
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span class="pill__text">
        {$_('hub.regionProgress', { values: { completed: completedCount, total: totalCount } })}
      </span>
    {:else}
      <Globe class="pill__icon" aria-hidden="true" />
      <!-- Full label on desktop, count-only on mobile to save space -->
      <span class="pill__text pill__text--full">
        {$_('hub.regionCount', { values: { count: regionCount } })}
        <span class="pill__sep">·</span>
        {$_('hub.playgroundCount', { values: { count: playgroundCount } })}
      </span>
      <span class="pill__text pill__text--compact">{playgroundCount}</span>
    {/if}
  </button>
</div>

<style>
  /* The drawer lives above the pill in document order (and so above in the
     flex column), so it appears to slide up from the pill when toggled. */
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 36px;
    padding: 0 0.85rem;
    background: #fff;
    border: none;
    border-radius: 999px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    color: #212529;
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1;
    transition: background 0.15s, box-shadow 0.15s;
    white-space: nowrap;
  }

  .pill:hover,
  .pill:focus-visible {
    background: #f8f9fa;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
  }

  .pill:focus-visible {
    outline: 2px solid #4c9aff;
    outline-offset: 2px;
  }

  .pill--error {
    color: #b91c1c;
  }

  .pill--loading {
    color: #6b7280;
  }

  :global(.pill__icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .pill__text {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .pill__sep {
    color: #adb5bd;
  }

  .pill__text--compact {
    display: none;
  }

  @media (max-width: 1023px) {
    .pill__text--full {
      display: none;
    }
    .pill__text--compact {
      display: inline;
    }
  }
</style>
