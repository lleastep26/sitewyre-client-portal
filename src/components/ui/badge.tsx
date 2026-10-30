import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-charcoal/10 px-2 py-0.5 text-xs font-medium text-charcoal",
        className,
      )}
      {...props}
    />
  );
}
