<script>
  import { cn } from '../lib/utils.js';
  import { X, GripHorizontal } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';

  export let open = false;
  export let title = '';
  /** @type {'peek' | 'half' | 'full'} */
  export let snapPoint = 'half';

  let sheetEl;
  export let isDragging = false;
  let startY = 0;
  let startHeight = 0;
  export let currentHeight = 0;

  const snapHeights = {
    peek: 140,
    half: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400,
    full: typeof window !== 'undefined' ? window.innerHeight : 700,
  };

  $: if (open && !isDragging) {
    currentHeight = snapHeights[snapPoint];
  }

  function close() {
    open = false;
  }

  function handleTouchStart(e) {
    if (!e.target.closest('.bottom-sheet__handle')) return;
    isDragging = true;
    startY = e.touches[0].clientY;
    startHeight = currentHeight;
  }

  function handleTouchMove(e) {
    if (!isDragging) return;
    const deltaY = startY - e.touches[0].clientY;
    const newHeight = Math.max(100, Math.min(startHeight + deltaY, window.innerHeight - 40));
    currentHeight = newHeight;
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    
    // Snap to nearest point
    const distances = {
      peek: Math.abs(currentHeight - snapHeights.peek),
      half: Math.abs(currentHeight - snapHeights.half),
      full: Math.abs(currentHeight - snapHeights.full),
    };
    
    // Close if dragged below peek threshold
    if (currentHeight < 80) {
      close();
      return;
    }
    
    const nearest = Object.entries(distances).reduce((a, b) => 
      a[1] < b[1] ? a : b
    )[0];
    
    snapPoint = nearest;
    currentHeight = snapHeights[nearest];
  }

  function handleMouseDown(e) {
    if (!e.target.closest('.bottom-sheet__handle')) return;
    isDragging = true;
    startY = e.clientY;
    startHeight = currentHeight;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const newHeight = Math.max(100, Math.min(startHeight + deltaY, window.innerHeight - 40));
    currentHeight = newHeight;
  }

  function handleMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    
    // Snap logic same as touch
    if (currentHeight < 80) {
      close();
      return;
    }
    
    const distances = {
      peek: Math.abs(currentHeight - snapHeights.peek),
      half: Math.abs(currentHeight - snapHeights.half),
      full: Math.abs(currentHeight - snapHeights.full),
    };
    
    const nearest = Object.entries(distances).reduce((a, b) => 
      a[1] < b[1] ? a : b
    )[0];
    
    snapPoint = nearest;
    currentHeight = snapHeights[nearest];
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && open) close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop (only visible when expanded) -->
  {#if snapPoint === 'full'}
    <div
      class="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden"
      onclick={close}
      onkeydown={e => e.key === 'Enter' && close()}
      role="button"
      tabindex="-1"
      aria-label={$_('info.closeBtn')}
    ></div>
  {/if}

  <!-- Bottom Sheet - always light theme -->
  <div
    bind:this={sheetEl}
    class={cn(
      'fixed inset-x-0 bottom-0 z-50 shadow-xl lg:hidden bottom-sheet flex flex-col',
      snapPoint !== 'full' ? 'rounded-t-2xl' : '',
      isDragging ? '' : 'transition-[height] duration-300 ease-out'
    )}
    style="height: {currentHeight}px; background: #ffffff; color-scheme: light; --color-background: #ffffff; --color-foreground: #1f2937; --color-card: #ffffff; --color-card-foreground: #1f2937; --color-muted: #f3f4f6; --color-muted-foreground: #6b7280; --color-border: #e5e7eb;"
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    onmousedown={handleMouseDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="bottom-sheet-title"
    tabindex="-1"
  >
    <!-- Drag Handle -->
    <div class="bottom-sheet__handle flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
      <div class="w-12 h-1.5 rounded-full" style="background: rgba(107, 114, 128, 0.3);"></div>
    </div>

    <!-- Header -->
    {#if title}
      <div class="flex items-center justify-between px-4 pb-2" style="border-bottom: 1px solid #e5e7eb;">
        <h2 id="bottom-sheet-title" class="text-base font-semibold" style="color: #1f2937;">{title}</h2>
        <button
          class="p-1 rounded-md transition-colors"
          style="color: #6b7280;"
          onclick={close}
          aria-label={$_('info.closeBtn')}
        >
          <X class="h-5 w-5" />
        </button>
      </div>
    {/if}

    <!-- Content -->
    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
      <slot />
    </div>
  </div>
{/if}
