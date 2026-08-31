"""Work that must happen, but must not delay the response.

The turn used to await the outbound dispatch before returning — an HTTP POST to
the BFF which then calls Gmail. Delivery has always been best-effort ("logged,
never raised"), so nothing about correctness required the caller to wait for
it; it was simply on the response path.

`Background` collects that work during the turn and runs it later. The only
thing that changes is *when* the drain happens:

- no `Background` supplied → `run_turn` drains before returning, which is
  exactly the old ordering. This is what the tests and the parity harness use,
  and it is why deferral does not change observable behaviour.
- one supplied → the caller drains it after the response is sent.

Failures are contained the same way they always were: each task is awaited
independently and a failure is logged, never raised. A drain runs after the
response has gone out, so there is nobody left to raise *to*.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)

#: Deferred work is a zero-argument factory, not a coroutine object. Creating
#: the coroutine eagerly and never awaiting it (the inline path may drop it on
#: an error) emits "coroutine was never awaited" warnings; a factory is only
#: called at drain time.
Task = Callable[[], Awaitable[None]]


@dataclass
class Background:
    """An ordered list of post-response tasks."""

    tasks: list[tuple[str, Task]] = field(default_factory=list)
    #: Names of tasks that raised during the drain, for the caller to log.
    failures: list[str] = field(default_factory=list)
    drained: bool = False

    def defer(self, name: str, task: Task) -> None:
        self.tasks.append((name, task))

    async def drain(self) -> None:
        """Run every deferred task in order, swallowing individual failures.

        Order matters and is the caller's to choose: the turn pipeline
        dispatches before writing the turn document, so the document records
        what actually happened to the message rather than what was intended.
        """
        self.drained = True
        for name, task in self.tasks:
            try:
                await task()
            except Exception as exc:  # noqa: BLE001 — the response is already gone
                self.failures.append(name)
                logger.exception("deferred task %r failed: %s", name, exc)
        self.tasks.clear()
