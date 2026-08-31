"""Whose knowledge a retrieval may see.

Isolation used to be "the caller passes the right collection name". That is not
isolation — it is a naming convention, and a stale or wrong
`knowledge_source_id` reads somebody else's documents with nothing to stop it.
The channel scope gets a defence-in-depth assertion in the pipeline; the
knowledge source got none.

This makes the scope a **required argument** rather than a convention, so the
unsafe call cannot be written. `retrieve` takes a `KnowledgeScope` with no
default; omitting it is a TypeError at import-time-ish rather than a silent
cross-user read at 3am.

**Fail closed.** An incomplete scope returns no hits and a flag, never
unfiltered results. The failure mode of "salesperson sees no facts" is a bad
answer; the failure mode of "salesperson sees another person's price sheet" is
a breach.
"""
from __future__ import annotations

from dataclasses import dataclass

#: Payload keys. `user_id` is the partition key — see `ensure_collection`.
TENANT_KEY = "tenant_id"
USER_KEY = "user_id"
#: Which kind of memory a point holds.
MEMORY_KEY = "memory_type"

#: Verbatim document text. Quotable: the numeric-grounding guardrail compares a
#: generated reply against these, so they must be the author's own words.
SEMANTIC = "semantic"
#: Compressed 100-word extractions — decisions, entities, intent. Emphatically
#: NOT quotable: a summary has been through a model, so a figure in one may be
#: rounded or invented and must never be offered to a buyer as a fact.
EPISODIC = "episodic"


@dataclass(frozen=True)
class KnowledgeScope:
    """The (tenant, user) a retrieval or ingestion belongs to.

    Both are carried even though `user_id` alone would isolate. `tenant_id` is
    defence in depth — a user id colliding across tenants, or a bug that drops
    the user filter, still cannot cross an organisation boundary — and it is
    what makes offboarding a whole tenant one delete-by-filter.
    """

    tenant_id: str
    user_id: str | None = None
    #: None means "both kinds" — the turn pipeline reads semantic memory only,
    #: because episodic summaries cannot ground a number.
    memory_type: str | None = None

    @property
    def is_complete(self) -> bool:
        """Whether this scope can safely be used to read.

        `user_id` is optional on `OrchestratorInput` for backwards
        compatibility, so a turn can genuinely arrive without one. Such a turn
        gets no facts rather than everyone's.
        """
        return bool(self.tenant_id and self.user_id)

    def as_payload(self) -> dict:
        """Stamped onto every ingested point."""
        payload = {TENANT_KEY: self.tenant_id, USER_KEY: self.user_id}
        if self.memory_type:
            payload[MEMORY_KEY] = self.memory_type
        return payload

    def for_memory(self, memory_type: str) -> "KnowledgeScope":
        from dataclasses import replace

        return replace(self, memory_type=memory_type)

    def as_filter(self):
        """The Qdrant filter every query must carry.

        Imported lazily so unit tests that mock retrieval do not need
        qdrant-client installed — the same reason `qdrant.get_client` is lazy.
        """
        from qdrant_client import models

        return models.Filter(
            must=[
                models.FieldCondition(
                    key=TENANT_KEY, match=models.MatchValue(value=self.tenant_id)
                ),
                models.FieldCondition(
                    key=USER_KEY, match=models.MatchValue(value=self.user_id)
                ),
                *(
                    [
                        models.FieldCondition(
                            key=MEMORY_KEY,
                            match=models.MatchValue(value=self.memory_type),
                        )
                    ]
                    if self.memory_type
                    else []
                ),
            ]
        )

    def tenant_filter(self):
        """Tenant only — for offboarding an organisation, not for reads."""
        from qdrant_client import models

        return models.Filter(
            must=[
                models.FieldCondition(
                    key=TENANT_KEY, match=models.MatchValue(value=self.tenant_id)
                )
            ]
        )
