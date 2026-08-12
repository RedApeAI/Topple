"use client";

import * as React from "react";
import {
  ArrowUp,
  ChevronDown,
  Paperclip,
  PenLine,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CallSparkIcon,
  GmailIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "@/components/shared/icons/brand-icons";
import { cn } from "@/lib/utils";
import { useUIStore, type OperatorMode } from "@/store/ui.store";
import type { ChannelKey } from "@/types/channel.types";

const CHANNELS: {
  key: ChannelKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { key: "mail", label: "Mail", icon: GmailIcon },
  { key: "instagram", label: "Instagram", icon: InstagramIcon },
  { key: "call", label: "AI Calling", icon: CallSparkIcon },
];

const MODES: {
  key: OperatorMode;
  label: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    key: "copilot",
    label: "Co-pilot",
    icon: PenLine,
    description: "Drafts replies for your approval",
  },
  {
    key: "autopilot",
    label: "Autopilot",
    icon: Zap,
    description: "Acts and sends on its own",
  },
];

interface PromptInputProps {
  onSubmit?: (value: string, channel: ChannelKey) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * The Operator composer, per the Figma spec: a soft rounded shell holding a
 * white input card, with attach / channel-picker pills and a dark circular
 * send button on the row below.
 */
export function PromptInput({
  onSubmit,
  placeholder = "Write the command to agent, or use / for suggestions and @ to mention a person",
  disabled,
}: PromptInputProps) {
  const [value, setValue] = React.useState("");
  const [channel, setChannel] = React.useState(CHANNELS[0]);
  const operatorMode = useUIStore((s) => s.operatorMode);
  const setOperatorMode = useUIStore((s) => s.setOperatorMode);
  const mode = MODES.find((m) => m.key === operatorMode) ?? MODES[0];

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSubmit?.(value.trim(), channel.key);
    setValue("");
  };

  return (
    <div className="flex w-full flex-col gap-2 rounded-[22px] bg-secondary p-2">
      <div className="rounded-[16px] bg-card px-3.5 py-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          aria-label="Message the Operator"
          className="w-full resize-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Attach a file"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground transition-colors hover:bg-accent"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent">
              <channel.icon className="h-3.5 w-3.5" />
              {channel.label}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {CHANNELS.map((c) => (
                <DropdownMenuItem key={c.key} onClick={() => setChannel(c)}>
                  <c.icon className="h-3.5 w-3.5" />
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Operator mode: ${mode.label}`}
              className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              <mode.icon className="h-3.5 w-3.5" />
              {mode.label}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              {MODES.map((m) => (
                <DropdownMenuItem
                  key={m.key}
                  onClick={() => setOperatorMode(m.key)}
                >
                  <m.icon className="h-3.5 w-3.5" />
                  <div className="flex flex-col">
                    <span>{m.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {m.description}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
            (!value.trim() || disabled) && "opacity-40",
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
