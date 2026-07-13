import { cn } from "@/lib/utils";
import { PluciaLogoIcon } from "./icons/brand-icons";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/** The one place the brand gradient ring appears outside the Operator FAB. */
export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <span
      className={cn(
        "surface-brand-gradient inline-flex items-center justify-center rounded-xl p-[2px]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span className="surface-primary-gradient flex h-full w-full items-center justify-center rounded-[10px]">
        <PluciaLogoIcon className="h-[70%] w-[70%]" />
      </span>
    </span>
  );
}
