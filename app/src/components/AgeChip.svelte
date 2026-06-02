<script>
  import { _ } from 'svelte-i18n';

  /** @type {number|null} */
  export let minAge = null;
  /** @type {number|null} */
  export let maxAge = null;

  $: label = (minAge && maxAge)
    ? $_('details.ageRange', { values: { min: minAge, max: maxAge } })
    : minAge  ? $_('details.ageMin', { values: { age: minAge } })
    : maxAge  ? $_('details.ageMax', { values: { age: maxAge } })
    : null;
</script>

{#if label}
  <span class="age-chip">{label}</span>
{/if}

<style>
  .age-chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    background: #ecfdf5;
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #065f46;
    white-space: nowrap;
  }
</style>
