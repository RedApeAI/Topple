import { AppError } from "../lib/errors.js";

/**
 * Google Calendar, on behalf of one user.
 *
 * Same custody rule as Gmail: the OAuth token never leaves the server, and the
 * caller passes an already-resolved token rather than a user id, so there is
 * one place (`connectors.service`) deciding whose calendar is being touched.
 *
 * Deliberately read-and-propose. `createEvent` exists, but the Operator agent
 * reaches it only through the copilot approval path — an agent that can
 * silently write to a real calendar and email real attendees is a different
 * risk class from one that drafts.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  /** RFC3339, or a bare date for all-day events. */
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  attendees: { email: string; name?: string; responseStatus?: string }[];
  organizer?: { email: string; name?: string };
  hangoutLink?: string;
  htmlLink?: string;
  status?: string;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}

interface GoogleEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  organizer?: { email?: string; displayName?: string };
  attendees?: {
    email?: string;
    displayName?: string;
    responseStatus?: string;
  }[];
}

interface GoogleApiError {
  error?: {
    message?: string;
    errors?: { reason?: string }[];
    status?: string;
  };
}

function parseGoogleError(detail: string): GoogleApiError["error"] {
  try {
    return (JSON.parse(detail) as GoogleApiError).error;
  } catch {
    return undefined;
  }
}

/** e.g. "accessNotConfigured" (API disabled) vs "insufficientPermissions". */
function googleErrorReason(detail: string): string | undefined {
  const error = parseGoogleError(detail);
  return error?.errors?.[0]?.reason ?? error?.status;
}

function googleErrorMessage(detail: string): string {
  return parseGoogleError(detail)?.message ?? detail.slice(0, 200);
}

async function calendarFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      // A 403 from Google means several very different things, and the fix
      // differs for each. Collapsing them all to "reconnect" sends people to
      // re-consent when the real problem is a disabled API in the Cloud
      // project, which no amount of reconnecting will change.
      const reason = googleErrorReason(detail);
      if (reason === "accessNotConfigured") {
        throw new AppError(
          503,
          "CALENDAR_API_DISABLED",
          "The Google Calendar API isn't enabled for this project. Enable it in the Google Cloud console, wait a minute, then retry.",
        );
      }
      if (reason === "insufficientPermissions" || response.status === 401) {
        throw new AppError(
          403,
          "CALENDAR_NOT_CONNECTED",
          "Your Google grant doesn't cover Calendar. Reconnect Calendar in Connectors.",
        );
      }
      throw new AppError(
        403,
        "CALENDAR_FORBIDDEN",
        `Google refused the calendar request: ${googleErrorMessage(detail)}`,
      );
    }
    if (response.status === 429) {
      throw new AppError(
        429,
        "CALENDAR_RATE_LIMITED",
        "Google Calendar is rate limiting this account. Try again shortly.",
      );
    }
    throw new AppError(
      502,
      "CALENDAR_ERROR",
      `Calendar request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function toEvent(event: GoogleEvent): CalendarEvent {
  // An all-day event carries `date` instead of `dateTime`.
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  return {
    id: event.id,
    summary: event.summary ?? "(no title)",
    ...(event.description ? { description: event.description } : {}),
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    allDay,
    ...(event.location ? { location: event.location } : {}),
    attendees: (event.attendees ?? [])
      .filter((a) => a.email)
      .map((a) => ({
        email: a.email!,
        ...(a.displayName ? { name: a.displayName } : {}),
        ...(a.responseStatus ? { responseStatus: a.responseStatus } : {}),
      })),
    ...(event.organizer?.email
      ? {
          organizer: {
            email: event.organizer.email,
            ...(event.organizer.displayName
              ? { name: event.organizer.displayName }
              : {}),
          },
        }
      : {}),
    ...(event.hangoutLink ? { hangoutLink: event.hangoutLink } : {}),
    ...(event.htmlLink ? { htmlLink: event.htmlLink } : {}),
    ...(event.status ? { status: event.status } : {}),
  };
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------
export interface ListEventsOptions {
  /** RFC3339. Defaults to now. */
  timeMin?: string;
  /** RFC3339. Defaults to 7 days after `timeMin`. */
  timeMax?: string;
  maxResults?: number;
  query?: string;
  calendarId?: string;
}

export async function listEvents(
  token: string,
  options: ListEventsOptions = {},
): Promise<CalendarEvent[]> {
  const timeMin = options.timeMin ?? new Date().toISOString();
  const timeMax =
    options.timeMax ??
    new Date(Date.parse(timeMin) + 7 * 86_400_000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(Math.min(options.maxResults ?? 25, 250)),
    // Expand recurring events into occurrences — "am I free Tuesday" is about
    // occurrences, not rules.
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (options.query) params.set("q", options.query);

  const calendarId = encodeURIComponent(options.calendarId ?? "primary");
  const { items } = await calendarFetch<{ items?: GoogleEvent[] }>(
    token,
    `/calendars/${calendarId}/events?${params}`,
  );
  return (items ?? []).map(toEvent);
}

/**
 * Busy blocks in a window — the answer to "when is this person free".
 * Cheaper and more private than listing events: no titles or attendees.
 */
export async function freeBusy(
  token: string,
  timeMin: string,
  timeMax: string,
  calendarId = "primary",
): Promise<FreeBusySlot[]> {
  const body = await calendarFetch<{
    calendars?: Record<string, { busy?: FreeBusySlot[] }>;
  }>(token, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  return body.calendars?.[calendarId]?.busy ?? [];
}

export async function listCalendars(
  token: string,
): Promise<{ id: string; summary: string; primary: boolean }[]> {
  const { items } = await calendarFetch<{
    items?: { id: string; summary?: string; primary?: boolean }[];
  }>(token, "/users/me/calendarList");
  return (items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary ?? c.id,
    primary: Boolean(c.primary),
  }));
}

// --------------------------------------------------------------------------
// Writes
// --------------------------------------------------------------------------
export interface NewEvent {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  timeZone?: string;
  /** Email the attendees. Off by default — a proposal shouldn't spam anyone. */
  sendUpdates?: boolean;
  calendarId?: string;
}

/**
 * Email the invitation for an event that already exists.
 *
 * Adding a guest to an event is not the same as inviting them — the guest is
 * on the event either way, but whether it surfaces on their calendar depends
 * on their own "add invitations" setting. The invitation email is what makes
 * it reliably land, which is why this is a separate, explicit step rather than
 * a side effect of creation.
 */
export async function sendInvitations(
  token: string,
  eventId: string,
  attendees?: string[],
  calendarId = "primary",
): Promise<CalendarEvent> {
  const id = encodeURIComponent(calendarId);
  const params = new URLSearchParams({ sendUpdates: "all" });

  // PATCH with the attendee list re-stated, so this both adds anyone missing
  // and triggers the notification in one call.
  const body = attendees?.length
    ? { attendees: attendees.map((email) => ({ email })) }
    : {};

  const updated = await calendarFetch<GoogleEvent>(
    token,
    `/calendars/${id}/events/${encodeURIComponent(eventId)}?${params}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return toEvent(updated);
}

export async function createEvent(
  token: string,
  event: NewEvent,
): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(event.calendarId ?? "primary");
  const params = new URLSearchParams({
    sendUpdates: event.sendUpdates ? "all" : "none",
  });

  const created = await calendarFetch<GoogleEvent>(
    token,
    `/calendars/${calendarId}/events?${params}`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: event.summary,
        ...(event.description ? { description: event.description } : {}),
        ...(event.location ? { location: event.location } : {}),
        start: {
          dateTime: event.start,
          ...(event.timeZone ? { timeZone: event.timeZone } : {}),
        },
        end: {
          dateTime: event.end,
          ...(event.timeZone ? { timeZone: event.timeZone } : {}),
        },
        ...(event.attendees?.length
          ? { attendees: event.attendees.map((email) => ({ email })) }
          : {}),
      }),
    },
  );
  return toEvent(created);
}
