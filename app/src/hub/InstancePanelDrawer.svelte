<script>
  import { _ } from 'svelte-i18n';
  import { X } from 'lucide-svelte';
  import LegalContentModal from '../components/LegalContentModal.svelte';

  /** @type {Array<{ url: string, name: string, version: string|null, loading: boolean, error: string|null, playgroundCount: number, dataAgeSec: number|null, osmDataAgeSec: number|null, lastReachable: string|null, healthUp: boolean|null, observationStale: boolean }>} */
  export let backends;
  /** @type {string | null} */
  export let registryError;
  /** @type {Map<string, string[]>} */
  export let overlapWarnings = new Map();
  /** @type {() => void} */
  export let onclose;

  let drawerEl;

  // Focus trap: keep keyboard focus inside the drawer while it's open. The
  // pill's own ESC handling closes the drawer — here we only trap Tab.
  function handleKeydown(e) {
    if (e.key !== 'Tab' || !drawerEl) return;
    const focusable = drawerEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function formatDataAge(sec) {
    if (sec == null) return null;
    const m = Math.round(sec / 60);
    if (m < 60)   return $_('hub.dataAgeMinutes', { values: { m } });
    const h = Math.round(m / 60);
    if (h < 48)   return $_('hub.dataAgeHours',   { values: { h } });
    const d = Math.round(h / 24);
    return $_('hub.dataAgeDays', { values: { d } });
  }

  function formatLastReachable(iso) {
    if (!iso) return null;
    const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    const m = Math.round(diffSec / 60);
    if (m < 1)   return $_('hub.lastReachableJustNow');
    if (m < 60)  return $_('hub.lastReachableMinutes', { values: { m } });
    const h = Math.round(m / 60);
    return $_('hub.lastReachableHours', { values: { h } });
  }

  $: observationStaleAny = backends.some(b => b.observationStale);

  function completenessRatio(b) {
    if (b.loading || b.error) return -2;
    if (!b.completeness) return -1;
    const total = b.completeness.complete + b.completeness.partial + b.completeness.missing;
    return total > 0 ? b.completeness.complete / total : 0;
  }
  $: sortedBackends = [...backends].sort((a, b) => completenessRatio(b) - completenessRatio(a));

  let legalModalOpen = false;
  let legalContent = null;
  let legalError = null;
  let legalInfo = null;
  let legalLoading = false;

  async function openLegal(backendUrl, type) {
    legalContent = null;
    legalError = null;
    legalInfo = null;
    legalLoading = true;
    legalModalOpen = true;
    try {
      const res = await fetch(`${backendUrl}/rpc/get_legal?type=${type}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.content) {
        legalContent = data.content;
      } else {
        legalError = $_('legal.noContent');
      }
    } catch (e) {
      legalError = $_('legal.loadError', { values: { message: e.message } });
    } finally {
      legalLoading = false;
    }
  }

  function handleLegalClick(b, type) {
    const url = type === 'impressum' ? b.impressumUrl : b.privacyUrl;
    if (url) {
      window.open(url, '_blank', 'noopener');
    } else if (b.hasLegal) {
      openLegal(b.url, type);
    } else {
      legalContent = null;
      legalError = null;
      legalInfo = $_('legal.noneFor', { values: { name: b.name } });
      legalLoading = false;
      legalModalOpen = true;
    }
  }
</script>

<div
  class="drawer"
  role="dialog"
  aria-modal="true"
  aria-labelledby="instance-drawer-title"
  tabindex="-1"
  bind:this={drawerEl}
  onkeydown={handleKeydown}
>
  <header class="drawer__header">
    <h6 id="instance-drawer-title" class="drawer__title">{$_('hub.drawerTitle')}</h6>
    <button
      class="drawer__close"
      type="button"
      onclick={onclose}
      aria-label={$_('hub.closeBtn')}
    >
      <X class="h-4 w-4" />
    </button>
  </header>

  {#if registryError}
    <p class="drawer__message drawer__message--error">
      <i class="bi bi-exclamation-triangle-fill me-1"></i>
      {$_('hub.registryError')}
    </p>
  {:else if backends.length === 0}
    <p class="drawer__message">
      <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
      {$_('hub.loading')}
    </p>
  {:else}
    {#if observationStaleAny}
      <p class="drawer__stale-banner">
        <i class="bi bi-exclamation-circle me-1"></i>
        {$_('hub.observationStale')}
      </p>
    {/if}
    <ul class="instance-list">
      {#each sortedBackends as b (b.url)}
        <li class="instance-item">
          <div class="instance-row">
            <span class="instance-name">{b.name}</span>
            <div class="instance-row-end">
              <button
                class="legal-btn"
                title={$_('legal.impressum')}
                aria-label={$_('legal.impressumFor', { values: { name: b.name } })}
                onclick={() => handleLegalClick(b, 'impressum')}
              >§</button>
              <button
                class="legal-btn"
                title={$_('legal.datenschutz')}
                aria-label={$_('legal.datenschutzFor', { values: { name: b.name } })}
                onclick={() => handleLegalClick(b, 'datenschutz')}
              >🔒</button>
              {#if b.importing}
                <span class="badge instance-badge instance-badge--importing">{$_('hub.importing')}</span>
              {:else if b.version}
                <span class="badge instance-badge text-bg-secondary">{b.version}</span>
              {/if}
            </div>
          </div>

          {#if b.loading}
            <div class="instance-status text-muted">
              <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              {$_('details.loading')}
            </div>
          {:else if b.error}
            <div class="instance-status text-danger">
              <i class="bi bi-exclamation-triangle-fill me-1"></i>
              {$_('hub.instanceError')}
              {#if b.lastReachable}
                <span class="instance-freshness text-muted">
                  · {formatLastReachable(b.lastReachable)}
                </span>
              {:else if b.healthUp === false}
                <span class="instance-freshness text-muted">
                  · {$_('hub.neverReachable')}
                </span>
              {/if}
            </div>
          {:else}
            <div class="instance-status text-muted">
              <i class="bi bi-geo-alt-fill me-1"></i>
              {$_('hub.playgroundCount', { values: { count: b.playgroundCount } })}
            </div>
            {#if b.completeness}
              {@const { complete, partial, missing } = b.completeness}
              {@const total = complete + partial + missing}
              <div class="instance-completeness">
                <span class="cdot cdot--complete"></span>{complete} {$_('completeness.complete')}
                <span class="cdot cdot--partial"></span>{partial} {$_('completeness.partial')}
                <span class="cdot cdot--missing"></span>{missing} {$_('completeness.missing')}
              </div>
              {#if total > 0}
                {@const pct = Math.round(complete / total * 100)}
                <div class="completeness-bar-row">
                  <div class="completeness-bar" title="{pct} %">
                    <div class="completeness-bar__seg completeness-bar__seg--complete" style="width: {complete / total * 100}%"></div>
                    <div class="completeness-bar__seg completeness-bar__seg--partial"  style="width: {partial  / total * 100}%"></div>
                    <div class="completeness-bar__seg completeness-bar__seg--missing"  style="width: {missing  / total * 100}%"></div>
                  </div>
                  <span class="completeness-pct">{pct} %</span>
                </div>
              {/if}
            {/if}
            {#if b.osmDataAgeSec != null}
              <!-- Prefer the OSM source-data age (user-facing: "the data
                   you are looking at is N old") over the import-run age
                   (operator-facing: "did the cron run"). Pre-osm-data-age
                   backends fall back to dataAgeSec via the {:else} below. -->
              <div class="instance-freshness text-muted">
                <i class="bi bi-clock me-1"></i>
                {$_('hub.osmDataAge', { values: { age: formatDataAge(b.osmDataAgeSec) } })}
              </div>
            {:else if b.dataAgeSec != null}
              <div class="instance-freshness text-muted">
                <i class="bi bi-clock me-1"></i>
                {$_('hub.dataAge', { values: { age: formatDataAge(b.dataAgeSec) } })}
              </div>
            {/if}
            {#each (overlapWarnings.get(b.url) ?? []) as overlapName}
              <div class="instance-overlap text-warning">
                <i class="bi bi-exclamation-triangle me-1"></i>
                {$_('hub.bboxOverlap', { values: { name: overlapName } })}
              </div>
            {/each}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<LegalContentModal
  bind:open={legalModalOpen}
  content={legalContent}
  error={legalError}
  info={legalInfo}
  loading={legalLoading}
/>

<style>
  .drawer {
    width: 280px;
    max-height: min(60vh, 520px);
    background: #fff;
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    overflow-y: auto;
    animation: slideUp 0.15s ease-out;
    display: flex;
    flex-direction: column;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .drawer__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #dee2e6;
  }

  .drawer__title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #495057;
  }

  .drawer__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .drawer__close:hover,
  .drawer__close:focus-visible {
    background: #f1f3f5;
    color: #212529;
  }

  .drawer__message {
    margin: 0;
    padding: 0.75rem;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .drawer__message--error {
    color: #b91c1c;
  }

  .instance-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    overflow-y: auto;
  }

  .instance-item {
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid #f1f3f5;
    font-size: 0.8rem;
  }

  .instance-item:last-child {
    border-bottom: none;
  }

  .instance-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    margin-bottom: 0.15rem;
  }

  .instance-name {
    font-weight: 500;
    color: #212529;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .instance-row-end {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .legal-btn {
    background: none;
    border: none;
    padding: 0 0.15rem;
    font-size: 0.8rem;
    cursor: pointer;
    color: #6b7280;
    line-height: 1;
    border-radius: 3px;
  }
  .legal-btn:hover { color: #1a6b3a; background: #f0f9f4; }

  .instance-badge {
    font-size: 0.65rem;
    flex-shrink: 0;
  }

  .instance-badge--importing {
    background-color: #0d6efd;
    color: #fff;
  }

  .instance-status {
    font-size: 0.75rem;
  }

  .instance-freshness {
    font-size: 0.72rem;
    margin-top: 0.1rem;
  }

  .instance-completeness {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: #6b7280;
    margin-top: 0.15rem;
  }

  .cdot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cdot--complete { background: #16a34a; }
  .cdot--partial  { background: #d97706; }
  .cdot--missing  { background: #dc2626; }

  .completeness-bar-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.2rem;
  }

  .completeness-pct {
    font-size: 0.68rem;
    color: #6b7280;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 2.5rem;
    text-align: right;
  }

  .completeness-bar {
    flex: 1;
    display: flex;
    height: 4px;
    border-radius: 2px;
    overflow: hidden;
    background: #e5e7eb;
  }

  .completeness-bar__seg {
    height: 100%;
    min-width: 0;
    transition: width 0.3s ease;
  }
  .completeness-bar__seg--complete { background: #16a34a; }
  .completeness-bar__seg--partial  { background: #d97706; }
  .completeness-bar__seg--missing  { background: #dc2626; }

  .instance-overlap {
    font-size: 0.72rem;
    margin-top: 0.1rem;
  }

  .drawer__stale-banner {
    margin: 0;
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    color: #92400e;
    background: #fef3c7;
    border-bottom: 1px solid #fde68a;
  }
</style>
