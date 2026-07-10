try:
    from fastapi import FastAPI
except ModuleNotFoundError as exc:
    raise RuntimeError(
        "FastAPI is not installed. Install this app's Python dependencies to run "
        "the real API server."
    ) from exc

app = FastAPI(title="Plucia Worker API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "worker"}
