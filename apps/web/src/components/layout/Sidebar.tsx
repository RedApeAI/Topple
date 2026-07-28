"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LogoMark } from "@/components/shared/Logo";
import { UnreadBadge } from "@/components/shared/UnreadBadge";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";
import { useChannelNav } from "@/hooks/use-channel-nav";
import { currentUser } from "@/constants/team.constants";
import {
  bottomNavItems,
  dashboardSection,
  socialsSection,
  type NavItem,
  type NavSection,
} from "@/constants/nav.constants";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const pathname = usePathname();
  const { data: channelNav } = useChannelNav();

  const unreadFor = (unreadKey?: string) =>
    channelNav?.find((c) => c.key === unreadKey)?.unread ?? 0;

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar p-3 transition-[width] duration-200",
        collapsed ? "w-[84px] items-center px-3" : "w-[280px] p-5",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col gap-[30px]",
          collapsed && "items-center gap-7",
        )}
      >
        <div className={cn("flex w-full flex-col gap-5", collapsed && "gap-6")}>
          <div
            className={cn(
              "flex items-center justify-between",
              collapsed && "flex-col gap-4",
            )}
          >
            <div className="flex items-center gap-2">
              <LogoMark size={36} />
              {!collapsed && (
                <div className="flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className="font-heading text-[16px] font-semibold text-foreground">
                      Plucia
                    </span>
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                      Pro
                    </span>
                  </div>
                  <span className="text-[12px] font-medium text-muted-foreground">
                    pluciatest@gmail.com
                  </span>
                </div>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger
                onClick={toggleSidebar}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? "Expand sidebar" : "Collapse sidebar"}
              </TooltipContent>
            </Tooltip>
          </div>

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                aria-label="Search"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
              >
                <Search className="h-5 w-5" />
              </TooltipTrigger>
              <TooltipContent side="right">Search</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex w-full items-center gap-1.5 rounded-md bg-secondary px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-[14px] font-medium text-muted-foreground">
                Search
              </span>
              <kbd className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-card text-[13px] font-medium text-foreground shadow-row">
                /
              </kbd>
            </div>
          )}
        </div>

        <NavGroup
          section={dashboardSection}
          pathname={pathname}
          collapsed={collapsed}
          unreadFor={unreadFor}
        />
        <NavGroup
          section={socialsSection}
          pathname={pathname}
          collapsed={collapsed}
          unreadFor={unreadFor}
        />
      </div>

      <div
        className={cn(
          "flex w-full flex-col gap-4",
          collapsed && "items-center",
        )}
      >
        <div
          className={cn(
            "flex w-full flex-col gap-0.5",
            collapsed && "items-center gap-1.5",
          )}
        >
          {bottomNavItems.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              unread={0}
            />
          ))}
        </div>
        <Separator />
        {collapsed ? (
          <Avatar className="h-11 w-11 rounded-xl">
            <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
            <AvatarFallback className="rounded-xl text-[12px]">
              {initials(currentUser.name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-[10px] bg-card px-2 py-2 pr-3 shadow-row hover:bg-accent"
          >
            <Avatar className="h-10 w-10 rounded-[6px]">
              <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
              <AvatarFallback className="rounded-[6px] text-[13px]">
                {initials(currentUser.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col items-start overflow-hidden text-left">
              <span className="w-full truncate font-heading text-[14px] font-semibold text-foreground">
                {currentUser.name}
              </span>
              <span className="w-full truncate text-[14px] font-medium text-muted-foreground">
                {currentUser.email}
              </span>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>
    </aside>
  );
}

function NavGroup({
  section,
  pathname,
  collapsed,
  unreadFor,
}: {
  section: NavSection;
  pathname: string;
  collapsed: boolean;
  unreadFor: (key?: string) => number;
}) {
  return (
    <div className="flex w-full flex-col gap-2.5">
      {!collapsed && (
        <div className="flex items-center gap-1">
          <span className="text-[14px] font-medium text-muted-foreground">
            {section.label}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div
        className={cn(
          "flex w-full flex-col gap-0.5",
          collapsed && "items-center gap-1.5",
        )}
      >
        {section.items.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            unread={unreadFor(item.unreadKey)}
          />
        ))}
      </div>
    </div>
  );
}

function NavRow({
  item,
  pathname,
  collapsed,
  unread,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  unread: number;
}) {
  const active = pathname === item.href;
  const Icon = item.icon;

  const row = (
    <Link
      href={item.href}
      aria-label={item.label}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[14px] font-medium text-secondary-foreground transition-colors hover:bg-accent",
        active && "bg-card text-foreground shadow-row",
        collapsed && "h-11 w-11 justify-center rounded-xl p-0",
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", collapsed && "h-6 w-6")} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          <UnreadBadge count={unread} />
        </>
      )}
    </Link>
  );

  if (!collapsed) return row;

  return (
    <Tooltip>
      <TooltipTrigger render={<div className="relative" />}>
        {row}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive" />
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
