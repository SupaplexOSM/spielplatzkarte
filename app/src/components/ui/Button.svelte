<script>
  import { cn } from '../../lib/utils.js';

  /** @type {'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'} */
  export let variant = 'default';
  /** @type {'default' | 'sm' | 'lg' | 'icon'} */
  export let size = 'default';
  /** @type {string} */
  let className = '';
  export { className as class };

  const baseStyles = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
    destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
    outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  };

  const sizes = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md px-3 text-xs',
    lg: 'h-10 rounded-md px-8',
    icon: 'h-9 w-9',
  };

  $: classes = cn(baseStyles, variants[variant], sizes[size], className);
</script>

<button class={classes} {...$$restProps}>
  <slot />
</button>
