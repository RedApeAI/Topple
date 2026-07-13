"use client";

import * as React from "react";
import { ArrowUp, ChevronDown, Mic, Paperclip } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/shared/IconButton";
import {
  WhatsAppIcon,
  GmailIcon,
  LinkedInIcon,
} from "@/components/shared/icons/brand-icons";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { key: "mail", label: "Mail", icon: GmailIcon },
  { key: "linkedin", label: "Linkedin", icon: LinkedInIcon },
];

interface PromptInputProps {
  onSubmit?: (value: string) => void;
  placeholder?: string;
}

export function PromptInput({
  onSubmit,
  placeholder = "Write the command to agent, or use / for suggestions and @ to mention a person",
}: PromptInputProps) {
  const [value, setValue] = React.useState("");
  const [channel, setChannel] = React.useState(CHANNELS[0]);

  const submit = () => {
    if (!value.trim()) return;
    onSubmit?.(value.trim());
    setValue("");
  };

  return (
    <div className="flex w-full flex-col gap-2 rounded-[14px] border border-border bg-card p-2.5">
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
        aria-label="Message the Operator"
        className="w-full resize-none bg-transparent px-1 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <IconButton
            aria-label="Attach a file"
            variant="ghost"
            className="h-8 w-8"
          >
            <Paperclip className="h-4 w-4" />
          </IconButton>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-secondary-foreground hover:bg-accent">
              <channel.icon className="h-3.5 w-3.5" />
              {channel.label}
              <ChevronDown className="h-3.5 w-3.5" />
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
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label={value.trim() ? "Send message" : "Record voice message"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
            value.trim()
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {value.trim() ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
