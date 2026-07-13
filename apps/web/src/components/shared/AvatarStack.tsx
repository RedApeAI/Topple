import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/types/user.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface AvatarStackProps {
  members: TeamMember[];
  visibleCount?: number;
  className?: string;
}

/** Overlapping avatar row with a "+N" overflow chip — used in the topbar. */
export function AvatarStack({
  members,
  visibleCount = 3,
  className,
}: AvatarStackProps) {
  const visible = members.slice(0, visibleCount);
  const overflow = members.length - visible.length;

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((member) => (
        <Avatar
          key={member.id}
          className="-mr-2.5 h-8 w-8 border-2 border-card shadow-avatar"
        >
          <AvatarImage src={member.avatarUrl} alt={member.name} />
          <AvatarFallback className="text-[11px]">
            {initials(member.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-[13px] font-medium text-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}
