import { cn } from "@/lib/utils";
import { PluciaLogoIcon } from "./icons/brand-icons";

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Circular variant, used where the mark sits among round chat avatars. */
  round?: boolean;
}

/** The one place the brand gradient ring appears outside the Operator FAB. */
export function LogoMark({ size = 36, className, round }: LogoMarkProps) {
  return (
    <span
      className={cn(
        "surface-brand-gradient inline-flex items-center justify-center p-[2px]",
        round ? "rounded-full" : "rounded-lg",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "surface-primary-gradient flex h-full w-full items-center justify-center",
          round ? "rounded-full" : "rounded-lg",
        )}
      >
        <PluciaLogoIcon className="h-[60%] w-[60%]" />
      </span>
    </span>
  );
}

export function LogoSmall({ size = 36, className }: LogoMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center p-[2px]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "surface-primary-gradient flex h-full w-full items-center justify-center rounded-sm",
        )}
      >
        <PluciaLogoIcon className="h-[60%] w-[60%]" />
      </span>
    </span>
  );
}
