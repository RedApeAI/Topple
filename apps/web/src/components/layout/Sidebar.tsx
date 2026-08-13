"use client";

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ChevronsUpDown,
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  Search,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAuthStore } from "@/store/auth.store";
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
  const [isHovering, setIsHovering] = useState(false);
  const { pathname } = useLocation();
  const { data: channelNav } = useChannelNav();
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const logout = useAuthStore((s) => s.logout);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = user?.name ?? "Account";
  const avatarUrl = user?.image ?? undefined;
  const teamName = organization?.name ?? "Workspace";

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  // Collapsed sidebar temporarily expands on hover; the persisted
  // `collapsed` preference only changes via the collapse button.
  const isRail = collapsed && !isHovering;

  const unreadFor = (unreadKey?: string) =>
    channelNav?.find((c) => c.key === unreadKey)?.unread ?? 0;

  return (
    <aside
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar p-3 transition-[width] duration-200",
        isRail ? "w-[84px] items-center px-3" : "w-[280px] p-5",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col gap-[30px]",
          isRail && "items-center gap-7",
        )}
      >
        <div className={cn("flex w-full flex-col gap-5", isRail && "gap-6")}>
          <div
            className={cn(
              "flex items-center justify-between",
              isRail && "flex-col gap-4",
            )}
          >
            <div className="flex items-center gap-2">
              <LogoMark size={36} />
              {!isRail && (
                <div className="flex items-center gap-1">
                  <span className="font-heading text-[16px] font-semibold text-foreground">
                    Plucia
                  </span>
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Pro
                  </span>
                </div>
              )}
            </div>
            {!collapsed && (
              <Tooltip>
                <TooltipTrigger
                  onClick={toggleSidebar}
                  aria-label="Collapse sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="right">Collapse sidebar</TooltipContent>
              </Tooltip>
            )}
          </div>

          {isRail ? (
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
          collapsed={isRail}
          unreadFor={unreadFor}
        />
        <NavGroup
          section={socialsSection}
          pathname={pathname}
          collapsed={isRail}
          unreadFor={unreadFor}
        />
      </div>

      <div
        className={cn("flex w-full flex-col gap-4", isRail && "items-center")}
      >
        <div
          className={cn(
            "flex w-full flex-col gap-0.5",
            isRail && "items-center gap-1.5",
          )}
        >
          {bottomNavItems.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={isRail}
              unread={0}
            />
          ))}
        </div>
        <Separator />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Open account menu for ${displayName}`}
            className={cn(
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isRail
                ? "rounded-xl"
                : "flex w-full items-center gap-2.5 rounded-[10px] bg-card px-2 py-2 pr-3 text-left shadow-row hover:bg-accent",
            )}
          >
            <Avatar className="h-10 w-10 rounded-[6px]">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="rounded-[6px] text-[13px]">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            {!isRail && (
              <>
                <div className="flex flex-1 flex-col items-start overflow-hidden text-left">
                  <span className="w-full truncate font-heading text-[14px] font-semibold text-foreground">
                    {displayName}
                  </span>
                  {/* The team, not the email — the email is already the account
                      identity above, and which workspace you are acting in is the
                      thing that changes what the agent can see. */}
                  <span className="w-full truncate text-[14px] font-medium text-muted-foreground">
                    {teamName}
                  </span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            className="min-w-56 p-1.5"
          >
            <DropdownMenuLabel className="px-2 py-1.5">
              <span className="block truncate text-[13px] font-semibold text-foreground">
                {displayName}
              </span>
              {user?.email ? (
                <span className="mt-0.5 block truncate font-normal text-muted-foreground">
                  {user.email}
                </span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              className="px-2 py-2"
            >
              {loggingOut ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LogOut />
              )}
              {loggingOut ? "Logging out…" : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isRail ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Log out"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-destructive/20 text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-60"
                />
              }
            >
              {loggingOut ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="right">
              {loggingOut ? "Logging out…" : "Log out"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-destructive/20 px-3 py-2.5 text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-60"
          >
            {loggingOut ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {loggingOut ? "Logging out…" : "Log out"}
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
    <div
      className={cn(
        "flex w-full flex-col gap-2.5",
        collapsed && "items-center",
      )}
    >
      {collapsed ? (
        <div className="h-px w-8 bg-sidebar-border" />
      ) : (
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
      to={item.href}
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
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-sidebar" />
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
