<script>
  import { _ } from 'svelte-i18n';

  export let open = false;
  /** @type {string | null} */
  export let content = null;
  /** @type {string | null} */
  export let error = null;
  /** @type {string | null} */
  export let info = null;
  export let loading = false;

  function close() { open = false; }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) close();
  }

  function onKeydown(e) {
    if (open && e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" onclick={onBackdropClick}>
    <div class="modal-box" role="dialog" aria-modal="true" aria-label={$_('legal.contentTitle')}>
      <div class="modal-header">
        <span class="modal-title">{$_('legal.contentTitle')}</span>
        <button type="button" class="close-btn" onclick={close} aria-label={$_('hub.closeBtn')}>✕</button>
      </div>
      <div class="modal-body">
        {#if loading}
          <p class="status-msg">{$_('legal.loading')}</p>
        {:else if error}
          <p class="status-msg status-msg--error">{error}</p>
        {:else if info}
          <p class="status-msg">{info}</p>
        {:else if content}
          <iframe
            srcdoc={content}
            sandbox="allow-same-origin"
            title={$_('legal.contentTitle')}
            class="content-frame"
          ></iframe>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-box {
    background: #fff;
    border-radius: 6px;
    width: min(92vw, 680px);
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #dee2e6;
    flex-shrink: 0;
  }

  .modal-title { font-size: 1rem; font-weight: 600; }

  .close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    color: #6c757d;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }
  .close-btn:hover { color: #000; background: #f0f0f0; }

  .modal-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .content-frame {
    width: 100%;
    flex: 1;
    border: none;
    min-height: 400px;
  }

  .status-msg {
    padding: 1rem;
    font-size: 0.875rem;
    color: #6c757d;
    margin: 0;
  }
  .status-msg--error { color: #b91c1c; }
</style>
