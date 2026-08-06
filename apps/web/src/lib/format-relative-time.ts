/**
 * Timestamp formatting for the inbox.
 *
 * The orchestrator marks its naive-UTC Mongo datetimes with a trailing "Z"
 * (see `_jsonable` in the orchestrator's `main.py`), so `Date` parses them
 * correctly. Anything unparseable formats to an empty string rather than
 * "Invalid Date" — a row with a missing timestamp should look blank, not
 * broken.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function parse(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Compact age for a conversation row: "now", "3m ago", "5h ago", "2d ago". */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
): string {
  const date = parse(value);
  if (!date) return "";

  const elapsed = Date.now() - date.getTime();
  // A clock skew between the browser and the server can put a fresh message
  // slightly in the future; that still reads as "now".
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    // Only disambiguate the year once the message is from a different one.
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** Clock time on a chat bubble: "9:42 pm" today, "Mon 9:42 pm" this week. */
export function formatMessageTime(
  value: string | number | Date | null | undefined,
): string {
  const date = parse(value);
  if (!date) return "";

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;

  if (now.getTime() - date.getTime() < WEEK) {
    return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}
