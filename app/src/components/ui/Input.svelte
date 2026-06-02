<script>
  import { cn } from '../../lib/utils.js';

  export let value = '';
  export let type = 'text';
  let className = '';
  export { className as class };

  const baseStyles = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  $: classes = cn(baseStyles, className);
</script>

<input {type} bind:value class={classes} {...$$restProps} />
