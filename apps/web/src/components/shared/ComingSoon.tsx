import { Sparkles } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/** Deliberate, designed empty-state for sections not yet built out — never a raw 404. */
export function ComingSoon({
  title,
  description,
  icon: Icon = Sparkles,
}: ComingSoonProps) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 rounded-[10px] bg-muted text-center">
      <div className="surface-primary-gradient flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
