"""The pre-LangGraph turn pipeline, vendored verbatim.

This is `app/engine/pipeline.py` and `app/engine/trace.py` as they stood at the
commit before the migration, with only their relative imports rewritten to
absolute (`..llm` → `app.llm`) so they can live outside the `app` package. The
bodies are byte-identical otherwise — `git diff` them against
`git show <pre-migration-sha>:…` to confirm.

It exists so `--impl legacy` runs *actual* old code rather than a description
of it. Nothing in `app/` imports this; it is a test fixture with a shelf life,
and it should be deleted once the migration is signed off.
"""
from .pipeline import ScopeDenied, TurnInProgress, run_turn  # noqa: F401
