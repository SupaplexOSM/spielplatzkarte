<script>
  import { objDevices, objFitnessStation } from '../lib/objPlaygroundEquipment.js';
  import { _ } from 'svelte-i18n';

  /** @type {{ x: number, y: number } | null} */
  export let position = null;
  /** @type {import('ol').Feature | null} */
  export let feature = null;

  $: props = feature?.getProperties() ?? null;
  $: label = (() => {
    if (!props) return '';
    if (props.name) return props.name;
    if (props.playground && props.playground !== 'yes') {
      return $_('equipment.devices.' + props.playground, { default: objDevices[props.playground]?.name_de ?? props.playground });
    }
    if (props.leisure === 'fitness_station') {
      const ft = props.fitness_station;
      return ft ? $_('equipment.fitness.' + ft, { default: objFitnessStation[ft] ?? $_('equipment.fitnessDefault') }) : $_('equipment.fitnessDefault');
    }
    if (props.leisure === 'pitch') {
      const sport = props.sport;
      return sport ? $_('equipment.pitches.' + sport, { default: `${$_('equipment.pitchDefault')} (${sport})` }) : $_('equipment.pitchDefault');
    }
    if (props.amenity === 'bench') return $_('equipment.devices.bench', { default: 'Bench' });
    if (props.amenity === 'shelter') return $_('equipment.devices.shelter', { default: 'Shelter' });
    if (props.leisure === 'picnic_table') return $_('equipment.devices.picnic_table', { default: 'Picnic table' });
    return props.playground || $_('equipment.fitnessDefault');
  })();

  $: panoramaxUuid = (() => {
    if (!props) return null;
    if (props.panoramax) return props.panoramax;
    for (let i = 0; i <= 9; i++) {
      const v = props[`panoramax:${i}`];
      if (v) return v;
    }
    return null;
  })();
  $: thumbUrl = panoramaxUuid ? `https://api.panoramax.xyz/api/pictures/${panoramaxUuid}/thumb.jpg` : null;

  $: style = position ? `left: ${position.x}px; top: ${position.y}px;` : '';
  // Flip tooltip below the cursor when near the top of the viewport.
  // 420px covers the image (640×360 at 16/9) plus label and caret.
  $: showBelow = position ? position.y < 420 : false;
</script>

{#if position && props}
  <div
    class="fixed z-[60] pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150"
    {style}
  >
    {#if showBelow}
      <div class="relative -translate-x-1/2 mt-3">
        <div class="absolute left-1/2 -translate-x-1/2 -top-2">
          <div
            class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px]"
            style="border-bottom-color: #ffffff;"
          ></div>
        </div>
        <div class="equip-tooltip rounded-lg shadow-lg border">
          {#if thumbUrl}
            <img src={thumbUrl} alt={label} class="thumb" />
          {/if}
          <div class="px-2.5 py-1.5 text-sm font-medium">{label}</div>
        </div>
      </div>
    {:else}
      <div class="relative -translate-x-1/2 -translate-y-full -mt-3">
        <div class="equip-tooltip rounded-lg shadow-lg border">
          {#if thumbUrl}
            <img src={thumbUrl} alt={label} class="thumb" />
          {/if}
          <div class="px-2.5 py-1.5 text-sm font-medium">{label}</div>
        </div>
        <div class="absolute left-1/2 -translate-x-1/2 -bottom-2">
          <div
            class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px]"
            style="border-top-color: #ffffff;"
          ></div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .equip-tooltip {
    background: #ffffff;
    border-color: #e5e7eb;
    color: #1f2937;
    max-width: 640px;
    overflow: hidden;
  }
  .thumb {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    display: block;
    border-radius: 6px 6px 0 0;
  }
</style>
