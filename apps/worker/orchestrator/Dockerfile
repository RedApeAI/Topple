# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# apps/worker/orchestrator — the agent runtime.
#
# Build from the REPO ROOT so one .dockerignore governs both images:
#     docker build -f apps/worker/orchestrator/Dockerfile -t redape-orchestrator .
#
# This runs as a long-lived process, not a request handler. engine/background.py
# defers the outbound dispatch, trace write and event publish until after the
# response has been sent, and the lifespan hook replays turns whose deferred
# work never ran. Both need the process to outlive the request.
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv

# ---------------------------------------------------------------------------
# Dependencies, in their own layer so a source edit does not reinstall onnx.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY apps/worker/orchestrator/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Bake the embedding model into the image.
#
# stores/qdrant.py embeds with fastembed's BAAI/bge-small-en-v1.5, which
# qdrant-client downloads (~130 MB) on first use. Left alone that lands in the
# system temp directory, so the first upload after every deploy stalls behind a
# HuggingFace download and a HuggingFace outage becomes an ingest outage.
# FASTEMBED_CACHE_PATH is read by set_model, and is set for the running
# container too so it finds what this step wrote.
# ---------------------------------------------------------------------------
FROM deps AS model
ENV FASTEMBED_CACHE_PATH=/opt/fastembed
RUN python -c "\
from fastembed import TextEmbedding; \
TextEmbedding(model_name='BAAI/bge-small-en-v1.5', cache_dir='/opt/fastembed')"

# ---------------------------------------------------------------------------
# Runtime.
# ---------------------------------------------------------------------------
FROM model AS runtime
# Playbook YAML lives under app/playbooks and is loaded from disk at runtime,
# so it ships with the code rather than being mounted.
COPY apps/worker/orchestrator/app ./app

# No .env is copied — see .dockerignore. Settings come from the platform's
# secret store, and pydantic-settings prefers real environment variables over
# the file anyway.

RUN useradd --system --create-home --uid 10001 orchestrator \
    && chown -R orchestrator:orchestrator /srv /opt/fastembed
USER orchestrator

EXPOSE 8000

# One worker, deliberately. A second would duplicate the lifespan hook's
# recover_incomplete_turns sweep on every boot; the idempotency protocol makes
# that safe but pointless. Scale by adding machines, not workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
