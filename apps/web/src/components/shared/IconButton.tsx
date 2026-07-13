import * as React from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  variant?: "subtle" | "ghost";
}

/** Icon-only button — `aria-label` is required since these never carry visible text. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          variant === "subtle" && "bg-secondary shadow-row hover:bg-accent",
          variant === "ghost" && "hover:bg-accent",
          className,
        )}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";
