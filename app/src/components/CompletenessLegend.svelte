<script>
  import { _ } from 'svelte-i18n';
  import Badge from './ui/Badge.svelte';
</script>

<aside class="legend">
  <p class="legend-title">{$_('completeness.legendTitle')}</p>
  <div class="legend-chips">
    <Badge variant="success">{$_('completeness.complete')}</Badge>
    <Badge variant="warning">{$_('completeness.partial')}</Badge>
    <Badge variant="destructive">{$_('completeness.missing')}</Badge>
  </div>
</aside>

<style>
  .legend {
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(4px);
    border-radius: 0.5rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    padding: 0.5rem 0.65rem;
    font-size: 0.72rem;
    color: #374151;
    max-width: 200px;
  }

  .legend-title {
    margin: 0 0 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
  }

  .legend-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

</style>
