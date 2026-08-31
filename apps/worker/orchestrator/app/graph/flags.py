"""Per-tenant feature flags.

Behaviour-changing graph work ships dark. Each feature is a separate setting
holding a comma-separated tenant allowlist, or `*` for everyone, so a
regression is one tenant's problem rather than the fleet's.

`GRAPH_PIPELINE_ENABLED` is the coarse switch: a tenant listed there gets every
Phase 4 feature without being listed individually. A per-feature setting can
still enable one feature for a tenant that is not in the coarse list.
"""
from __future__ import annotations

from functools import lru_cache

from ..config import settings

#: Feature name → the settings attribute holding its allowlist.
FEATURES: dict[str, str] = {
    "parallel_fanout": "graph_parallel_fanout",
    "speculative_retrieval": "graph_speculative_retrieval",
    "repair_violations": "graph_repair_violations",
    "stream_copilot": "graph_stream_copilot",
}

_MASTER = "graph_pipeline_enabled"


@lru_cache(maxsize=256)
def _allowlist(raw: str) -> frozenset[str]:
    return frozenset(part.strip() for part in raw.split(",") if part.strip())


def _listed(raw: str, tenant_id: str | None) -> bool:
    allowed = _allowlist(raw or "")
    return "*" in allowed or (tenant_id is not None and tenant_id in allowed)


def enabled(feature: str, tenant_id: str | None) -> bool:
    """Is `feature` on for this tenant?"""
    if feature not in FEATURES:
        raise KeyError(f"unknown feature {feature!r} — known: {sorted(FEATURES)}")
    if _listed(getattr(settings, _MASTER, ""), tenant_id):
        return True
    return _listed(getattr(settings, FEATURES[feature], ""), tenant_id)


def active_for(tenant_id: str | None) -> dict[str, bool]:
    """Every flag's state for one tenant — recorded on the turn document so a
    turn's behaviour can be explained months later without guessing which
    features were live at the time."""
    return {name: enabled(name, tenant_id) for name in FEATURES}
