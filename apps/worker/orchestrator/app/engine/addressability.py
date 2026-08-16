"""Is this address a person you could actually correspond with?

The mailbox directory is harvested from From/To/Cc headers, which means it
learns every automated sender the user has ever received mail from — and worse,
it learns them under a *human* name. Google Drive sends "Ariyaman Debnath
shared a document with you" from `drive-shares-dm-noreply@google.com` with the
sharer's display name in the From header, so the directory records a real
person's name against a robot address. Searching for that person then offers it
as a candidate, and the agent will cheerfully email it.

That is not merely noise. A no-reply address accepts the message and drops it,
so the salesperson is told their mail was sent when nobody will ever read it —
the same class of failure as claiming an invitation went out when it did not.

**Deliberately narrow.** `support@`, `sales@`, `hello@`, `billing@` are real
mailboxes that real people answer, and filtering them would break ordinary
sales correspondence. Only addresses that are structurally incapable of
receiving a reply are excluded.
"""
from __future__ import annotations

import re

#: Anywhere in the normalised local part — these never take replies.
_UNREACHABLE_SUBSTRINGS = (
    "noreply",
    "donotreply",
    "mailerdaemon",
    "autoreply",
    "autoresponder",
)

#: The whole normalised local part. Kept exact because each of these is a real
#: word that could legitimately appear inside a human address ("bouncer",
#: "postmasterson"), and a substring match would take innocents with it.
_UNREACHABLE_EXACT = frozenset(
    {
        "postmaster",
        "bounce",
        "bounces",
        "notification",
        "notifications",
        "notify",
        "automated",
        "daemon",
        "unsubscribe",
    }
)

_SEPARATORS = re.compile(r"[._\-+]")


def _local_part(email: str) -> str:
    """Lowercased local part with separators removed.

    `no-reply`, `no_reply` and `no.reply` are the same intent spelled three
    ways, and harvested addresses use all of them.
    """
    local = email.strip().lower().split("@", 1)[0]
    # Drop any +tag before normalising, so `noreply+123@` still matches.
    return _SEPARATORS.sub("", local.split("+", 1)[0])


def is_unreachable(email: str | None) -> bool:
    """True when nothing sent here will ever reach a human."""
    if not email or "@" not in email:
        return False
    local = _local_part(email)
    if not local:
        return False
    if local in _UNREACHABLE_EXACT:
        return True
    return any(marker in local for marker in _UNREACHABLE_SUBSTRINGS)


def reachable(entries: list[dict], *, key: str = "email") -> list[dict]:
    """Drop directory entries nobody could reply to."""
    return [entry for entry in entries if not is_unreachable(str(entry.get(key) or ""))]
