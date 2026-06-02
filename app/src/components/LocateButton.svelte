<script>
  import { fromLonLat } from 'ol/proj';
  import { mapStore } from '../stores/map.js';
  import { Navigation2, Loader2 } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';

  /** Called with (lat, lon) after a GPS fix is obtained. */
  export let onlocation = null;

  let locating = false;
  let error = '';

  function locate() {
    if (!navigator.geolocation) {
      error = $_('locate.notSupported');
      return;
    }
    locating = true;
    error = '';
    navigator.geolocation.getCurrentPosition(
      pos => {
        locating = false;
        const { latitude, longitude } = pos.coords;
        const coord = fromLonLat([longitude, latitude]);
        $mapStore?.getView().animate({ center: coord, zoom: 16 });
        if (onlocation) onlocation(latitude, longitude);
      },
      err => {
        locating = false;
        error = err.code === 1 ? $_('locate.denied') : $_('locate.unavailable');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }
</script>

<button
  class="control-btn"
  class:error={!!error}
  onclick={locate}
  disabled={locating}
  title={error || $_('locate.title')}
  aria-label={$_('locate.title')}
>
  {#if locating}
    <Loader2 class="h-5 w-5 animate-spin" />
  {:else}
    <Navigation2 class="h-5 w-5" />
  {/if}
</button>

<style>
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
  }

  .control-btn:hover {
    background: #f5f5f5;
    color: #333;
  }

  .control-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .control-btn.error {
    color: #d93025;
  }
</style>
