<script>
  import { cn } from '../../lib/utils.js';

  /** @type {'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'} */
  export let variant = 'default';
  let className = '';
  export { className as class };

  const baseStyles = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
    outline: 'text-foreground',
    success: 'border-transparent bg-success/15 text-success',
    warning: 'border-transparent bg-warning/15 text-warning',
  };

  $: classes = cn(baseStyles, variants[variant], className);
</script>

<span class={classes} {...$$restProps}>
  <slot />
</span>
