<script>
  import { cn } from '../../lib/utils.js';

  let className = '';
  export { className as class };
</script>

<div class={cn('rounded-xl border bg-card text-card-foreground shadow', className)} {...$$restProps}>
  <slot />
</div>
