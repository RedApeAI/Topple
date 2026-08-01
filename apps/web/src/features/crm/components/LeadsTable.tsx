"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
// Missing integration module: @/lib/format-relative-time
// import { formatRelativeTime } from "@/lib/format-relative-time";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ContactChannelBadges } from "./ContactChannelBadges";
import type { Lead, LeadChannel } from "../types/lead.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface LeadsTableProps {
  leads: Lead[] | undefined;
  isLoading: boolean;
  onContact: (lead: Lead, channel: LeadChannel) => void;
}

export function LeadsTable({ leads, isLoading, onContact }: LeadsTableProps) {
  const columns = React.useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        id: "name",
        header: "Lead",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-[11px]">
                {initials(row.original.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-medium text-foreground">
              {row.original.name}
            </span>
          </div>
        ),
      },
      {
        id: "channels",
        header: "Channels",
        cell: ({ row }) => (
          <ContactChannelBadges
            channels={row.original.channels}
            onSelect={(channel) => onContact(row.original, channel)}
          />
        ),
      },
      {
        id: "score",
        header: "Qualification",
        cell: ({ row }) => (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-2 text-[12px] font-medium text-secondary-foreground">
            {row.original.qualificationScore}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Added",
        cell: ({ row }) => (
          <span className="text-[13px] text-muted-foreground">
            {formatRelativeTime(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [onContact],
  );

  const table = useReactTable({
    data: leads ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-2 rounded-2xl bg-background p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-background text-center">
        <p className="text-[14px] font-medium text-foreground">No leads yet</p>
        <p className="text-[13px] text-muted-foreground">
          Import a CSV or Excel file to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="scrollbar-none flex-1 overflow-auto rounded-2xl bg-background">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border-subtle">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-[12px] font-medium text-muted-foreground"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border-subtle last:border-0 hover:bg-accent/50"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
