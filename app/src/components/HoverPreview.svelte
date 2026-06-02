<script>
  import OpeningHours from 'opening_hours';
  import { cn } from '../lib/utils.js';
  import { getPlaygroundTitle } from '../lib/playgroundHelpers.js';
  import { MapPin, Droplets, Baby, TreeDeciduous, Accessibility, Clock, LockKeyhole } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';

  /** @type {{ x: number, y: number } | null} */
  export let position = null;
  /** @type {Object | null} */
  export let feature = null;

  $: attr = feature?.getProperties() ?? null;
  $: title = attr ? getPlaygroundTitle(attr, $_) : '';
  $: isWater = attr?.is_water;
  $: hasTrees = attr?.tree_count > 0;
  $: forBaby = attr?.for_baby;
  $: isWheelchair = attr?.wheelchair === 'yes' || attr?.wheelchair === 'limited';
  $: isRestricted = attr?.access === 'private' || attr?.access === 'customers';
  $: area = attr?.area > 0 ? `${Math.round(attr.area / 10) * 10 || attr.area} m²` : null;

  $: surface = attr?.surface
    ? attr.surface.split(';').map(s => $_('details.surfaceValues.' + s.trim(), { default: s.trim() })).join(' / ')
    : null;

  $: ohOpen = (() => {
    if (!attr?.opening_hours || attr.opening_hours === '24/7') return null;
    try {
      return new OpeningHours(attr.opening_hours, { address: { country_code: 'de' } }).getState(new Date());
    } catch { return null; }
  })();

  $: style = position ? `left: ${position.x}px; top: ${position.y}px;` : '';
</script>

{#if position && attr}
  <div
    class={cn('fixed z-[60] pointer-events-none', 'animate-in fade-in-0 zoom-in-95 duration-150')}
    style={style}
  >
    <div class="relative -translate-x-1/2 -translate-y-full -mt-3">
      <div class="hover-card rounded-lg shadow-lg border p-3 min-w-[180px] max-w-[280px]">

        <!-- Title -->
        <h4 class="font-semibold text-sm leading-tight mb-1.5 line-clamp-2" style="color: #1f2937; hyphens: auto;" lang="de">
          {title}
        </h4>

        <!-- Tags row -->
        <div class="flex flex-wrap gap-1.5 mb-2">
          {#if isWater}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-water/15 text-water">
              <Droplets class="h-3 w-3" />{$_('hover.tagWater')}
            </span>
          {/if}
          {#if forBaby}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              <Baby class="h-3 w-3" />{$_('hover.tagBaby')}
            </span>
          {/if}
          {#if hasTrees}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-nature/15 text-nature">
              <TreeDeciduous class="h-3 w-3" />{$_('hover.tagTrees')}
            </span>
          {/if}
          {#if isWheelchair}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style="background:rgba(99,102,241,.1);color:#6366f1;">
              <Accessibility class="h-3 w-3" />{$_('hover.tagAccessible')}
            </span>
          {/if}
          {#if isRestricted}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style="background:rgba(107,114,128,.1);color:#6b7280;">
              <LockKeyhole class="h-3 w-3" />{$_('completeness.restrictedHint')}
            </span>
          {/if}
        </div>

        <!-- Meta row -->
        <div class="flex flex-col gap-1 text-xs" style="color: #6b7280;">
          <div class="flex items-center gap-1.5">
            <MapPin class="h-3 w-3 shrink-0" />
            <span>{area ?? $_('hover.playground')}{surface ? ` · ${surface}` : ''}</span>
          </div>
          {#if ohOpen !== null}
            <div class="flex items-center gap-1.5">
              <Clock class="h-3 w-3 shrink-0" />
              <span style="color: {ohOpen ? '#16a34a' : '#dc2626'}">
                {ohOpen ? $_('poi.open') : $_('poi.closed')}
              </span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Arrow pointing down -->
      <div class="absolute left-1/2 -translate-x-1/2 -bottom-2">
        <div class="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] drop-shadow-sm" style="border-top-color: #ffffff;"></div>
      </div>
    </div>
  </div>
{/if}

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Force light theme for hover preview card */
  .hover-card {
    background: #ffffff;
    border-color: #e5e7eb;
    color-scheme: light;

    /* Override CSS variables for light theme */
    --color-background: #ffffff;
    --color-foreground: #1f2937;
    --color-card: #ffffff;
    --color-card-foreground: #1f2937;
    --color-muted: #f3f4f6;
    --color-muted-foreground: #6b7280;
    --color-border: #e5e7eb;
    --color-primary: #10b981;
    --color-water: #3b82f6;
    --color-nature: #22c55e;
  }
</style>
