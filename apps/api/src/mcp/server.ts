import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AuthUser } from "../lib/auth.js";
import * as calendar from "../services/google-calendar.service.js";
import { isConnected, tokenForConnector } from "../services/connectors.service.js";

/**
 * Plucia's MCP server: the agent's window onto a user's connected accounts.
 *
 * Built per request and bound to one user. That binding is the point — MCP
 * servers are normally single-user desktop processes reading credentials off
 * disk, which does not survive contact with a multi-tenant app. Here the BFF
 * already owns every OAuth grant, so hosting MCP *here* keeps token custody
 * exactly where it was and leaves the orchestrator holding nothing.
 *
 * Tools are registered only for connectors the user has actually granted, so
 * an unconnected connector is invisible to the model rather than a tool that
 * always fails.
 */

/** MCP tools return content blocks; ours are JSON the agent reads as text. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

/**
 * Whether this run may notify people.
 *
 * Mode arrives as a request header rather than a tool argument on purpose: a
 * tool argument is chosen by the model, and "may I email an external party"
 * is not a decision to leave to a language model. Enforced here, it holds
 * regardless of what the model asks for.
 */
export type AgentMode = "copilot" | "autopilot";

export function registerCalendarTools(
  server: McpServer,
  user: AuthUser,
  mode: AgentMode = "copilot",
) {
  server.registerTool(
    "calendar_list_events",
    {
      title: "List calendar events",
      description:
        "The user's own calendar events in a time window. Use this to answer questions about their schedule. Times are RFC3339.",
      inputSchema: {
        time_min: z
          .string()
          .optional()
          .describe("RFC3339 start of the window. Defaults to now."),
        time_max: z
          .string()
          .optional()
          .describe("RFC3339 end of the window. Defaults to 7 days out."),
        query: z.string().optional().describe("Free-text filter on the event."),
        max_results: z.number().int().min(1).max(50).optional(),
      },
    },
    async (args) => {
      try {
        const token = await tokenForConnector(user, "google-calendar");
        const events = await calendar.listEvents(token, {
          ...(args.time_min ? { timeMin: args.time_min } : {}),
          ...(args.time_max ? { timeMax: args.time_max } : {}),
          ...(args.query ? { query: args.query } : {}),
          ...(args.max_results ? { maxResults: args.max_results } : {}),
        });
        return json({ events });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "calendar failed");
      }
    },
  );

  server.registerTool(
    "calendar_find_free_slots",
    {
      title: "Find free slots",
      description:
        "Open slots of at least `minutes` in a window, derived from the user's busy blocks. Prefer this over listing events when scheduling — it reveals availability without exposing what the meetings are.",
      inputSchema: {
        time_min: z.string().describe("RFC3339 start of the search window."),
        time_max: z.string().describe("RFC3339 end of the search window."),
        minutes: z
          .number()
          .int()
          .min(5)
          .max(480)
          .optional()
          .describe("Minimum slot length. Defaults to 30."),
      },
    },
    async (args) => {
      try {
        const token = await tokenForConnector(user, "google-calendar");
        const busy = await calendar.freeBusy(token, args.time_min, args.time_max);
        const minutes = args.minutes ?? 30;

        // Walk the gaps between busy blocks. Busy blocks come back sorted and
        // already merged by Google, so a single pass is enough.
        const slots: { start: string; end: string }[] = [];
        let cursor = Date.parse(args.time_min);
        const windowEnd = Date.parse(args.time_max);
        const needed = minutes * 60_000;

        for (const block of busy) {
          const blockStart = Date.parse(block.start);
          if (blockStart - cursor >= needed) {
            slots.push({
              start: new Date(cursor).toISOString(),
              end: new Date(blockStart).toISOString(),
            });
          }
          cursor = Math.max(cursor, Date.parse(block.end));
        }
        if (windowEnd - cursor >= needed) {
          slots.push({
            start: new Date(cursor).toISOString(),
            end: new Date(windowEnd).toISOString(),
          });
        }
        return json({ free_slots: slots, minimum_minutes: minutes });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "calendar failed");
      }
    },
  );

  server.registerTool(
    "calendar_propose_event",
    {
      title: "Propose a calendar event",
      description:
        mode === "autopilot"
          ? "Create an event on the user's calendar and email the invitation to every attendee. ALWAYS pass `attendees` when the command names a person — an event with no attendees reaches nobody. Look their address up with find_recipient first if you don't have it."
          : "Create an event on the user's calendar as a PROPOSAL. Attendees are attached but NOT emailed yet; the salesperson approves before anyone is invited. ALWAYS pass `attendees` when the command names a person, then tell the salesperson the invitation has not gone out and they can ask you to send it.",
      inputSchema: {
        summary: z.string().min(1).max(500).describe("Event title."),
        start: z.string().describe("RFC3339 start time."),
        end: z.string().describe("RFC3339 end time."),
        description: z.string().max(8000).optional(),
        location: z.string().max(1000).optional(),
        attendees: z
          .array(z.string().email())
          .max(50)
          .optional()
          .describe(
            mode === "autopilot"
              ? "Email addresses to invite. They WILL be emailed."
              : "Email addresses to attach. They are NOT emailed until approved.",
          ),
        time_zone: z
          .string()
          .optional()
          .describe("IANA zone, e.g. Asia/Dubai. Defaults to the calendar's."),
      },
    },
    async (args) => {
      try {
        const token = await tokenForConnector(user, "google-calendar");
        const event = await calendar.createEvent(token, {
          summary: args.summary,
          start: args.start,
          end: args.end,
          ...(args.description ? { description: args.description } : {}),
          ...(args.location ? { location: args.location } : {}),
          ...(args.attendees ? { attendees: args.attendees } : {}),
          ...(args.time_zone ? { timeZone: args.time_zone } : {}),
          // Autopilot invites; copilot attaches and waits for approval. The
          // model cannot override this — it is not in the tool's schema.
          sendUpdates: mode === "autopilot",
        });
        return json({
          event,
          notified_attendees: mode === "autopilot",
          ...(mode === "autopilot"
            ? {}
            : {
                note: "Attendees are on the event but have NOT been emailed. Tell the salesperson, and use calendar_send_invites once they approve.",
              }),
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "calendar failed");
      }
    },
  );
}

function registerInviteTool(server: McpServer, user: AuthUser) {
  server.registerTool(
    "calendar_send_invites",
    {
      title: "Send calendar invitations",
      description:
        "Email the invitation for an event that already exists, so it lands in the attendees' inboxes and calendars. Use this only when the salesperson has explicitly approved sending — it contacts people outside the company.",
      inputSchema: {
        event_id: z
          .string()
          .min(1)
          .describe("The id returned by calendar_propose_event."),
        attendees: z
          .array(z.string().email())
          .max(50)
          .optional()
          .describe("Adds these addresses before inviting, if not already on."),
      },
    },
    async (args) => {
      try {
        const token = await tokenForConnector(user, "google-calendar");
        const event = await calendar.sendInvitations(
          token,
          args.event_id,
          args.attendees,
        );
        return json({ event, notified_attendees: true });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "calendar failed");
      }
    },
  );
}

/**
 * An MCP server exposing exactly what this user has connected.
 *
 * Stateless and per-request: cheap to build, and it means a connector granted
 * a moment ago is usable on the very next call with no cache to invalidate.
 */
export async function buildMcpServer(
  user: AuthUser,
  mode: AgentMode = "copilot",
): Promise<McpServer> {
  const server = new McpServer(
    { name: "plucia", version: "1.0.0" },
    {
      instructions:
        "Tools for the signed-in salesperson's connected accounts. Every tool acts as that person; never assume access to anyone else's data.",
    },
  );

  if (await isConnected(user.id, "google-calendar")) {
    registerCalendarTools(server, user, mode);
    registerInviteTool(server, user);
  }

  return server;
}
