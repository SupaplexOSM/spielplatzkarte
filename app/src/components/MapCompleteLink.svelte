<script>
  import { Pencil } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';
  /** Target URL. When falsy, the component renders nothing — callers don't
   *  need to gate the render themselves. */
  export let href = '';
  /** Visible label. When empty, falls back to the i18n key for an accessible
   *  name so the icon-only link doesn't lose its affordance. */
  export let label = '';

  // Defense in depth: only allow http(s) URLs through to the rendered anchor.
  // mcUrl is internally constructed today, but a future caller passing
  // user-influenced input would otherwise be free to inject `javascript:`.
  $: safeHref = (typeof href === 'string' && /^https?:\/\//i.test(href)) ? href : '';
</script>

{#if safeHref}
  <a
    href={safeHref}
    target="_blank"
    rel="noopener noreferrer"
    class="mc-edit-link"
    aria-label={label || $_('popup.editInMapComplete')}
  >
    <Pencil class="h-3 w-3" aria-hidden="true" />
    {label}
  </a>
{/if}

<style>
  .mc-edit-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #9ca3af;
    text-decoration: none;
    transition: color 0.15s;
  }
  .mc-edit-link:hover {
    color: #374151;
    text-decoration: underline;
  }
  .mc-edit-link:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
    border-radius: 2px;
  }
</style>
