<script>
  import { cn } from '../../lib/utils.js';
  import { X } from 'lucide-svelte';

  export let open = false;
  /** @type {'top' | 'bottom' | 'left' | 'right'} */
  export let side = 'right';
  export let title = '';
  let className = '';
  export { className as class };

  const sideStyles = {
    top: 'inset-x-0 top-0 border-b',
    bottom: 'inset-x-0 bottom-0 border-t',
    left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
    right: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
  };

  const slideStyles = {
    top: open ? 'translate-y-0' : '-translate-y-full',
    bottom: open ? 'translate-y-0' : 'translate-y-full',
    left: open ? 'translate-x-0' : '-translate-x-full',
    right: open ? 'translate-x-0' : 'translate-x-full',
  };

  function close() {
    open = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/80 transition-opacity duration-300"
    class:opacity-100={open}
    class:opacity-0={!open}
    onclick={close}
    role="button"
    tabindex="-1"
    aria-label="Close"
  ></div>
{/if}

<!-- Sheet content -->
<div
  class={cn(
    'fixed z-50 gap-4 bg-background p-6 shadow-lg transition-transform duration-300 ease-in-out',
    sideStyles[side],
    slideStyles[side],
    className
  )}
  role="dialog"
  aria-modal="true"
  aria-labelledby="sheet-title"
>
  {#if title}
    <div class="flex items-center justify-between mb-4">
      <h2 id="sheet-title" class="text-lg font-semibold">{title}</h2>
      <button
        class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        onclick={close}
        aria-label="Schließen"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  {/if}
  <slot />
</div>
