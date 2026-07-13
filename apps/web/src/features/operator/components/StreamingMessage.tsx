"use client";

import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogoMark } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { currentUser } from "@/constants/team.constants";
import { pulseVariants } from "@/design/tokens/motion";
import type { OperatorMessage } from "../types/operator.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function StreamingMessage({ message }: { message: OperatorMessage }) {
  const isUser = message.role === "user";
  const isRunning = message.status === "running";

  return (
    <div
      className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}
    >
      {isUser ? (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-[11px]">
            {initials(currentUser.name)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <LogoMark size={32} className="shrink-0" />
      )}

      {isRunning ? (
        <motion.p
          variants={pulseVariants}
          animate="animate"
          className="pt-1.5 text-[13px] font-medium text-muted-foreground"
        >
          {message.text}
        </motion.p>
      ) : (
        <div
          className={cn(
            "max-w-[85%] rounded-[14px] bg-secondary px-3.5 py-2.5 text-[14px] leading-[1.4] text-secondary-foreground",
          )}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
