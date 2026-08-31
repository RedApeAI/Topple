try:
    from fastapi import FastAPI
except ModuleNotFoundError as exc:
    raise RuntimeError(
        "FastAPI is not installed. Install this app's Python dependencies to run "
        "the real call API server."
    ) from exc

app = FastAPI(title="RedApeAI Call API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "call"}
