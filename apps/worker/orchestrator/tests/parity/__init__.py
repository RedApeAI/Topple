"""Parity harness: does the LangGraph pipeline behave like the one it replaced?

Four pieces, in the order you'd use them:

- `recorder`  — captures envelopes and raw LLM request/response pairs into
                fixture files, redacting tenant-identifying content.
- `replayer`  — runs a fixture through one implementation with the LLM gateway
                stubbed to the recorded responses.
- `differ`    — compares two runs on a fixed field list, ignoring everything
                that legitimately varies between runs (time, latency, tokens).
- `__main__`  — `python -m tests.parity run --impl legacy --impl graph`

The comparison is deliberately narrow. Two runs of the same envelope will never
agree on timestamps or token counts, so including them would make every diff
noise; what must agree is the decisions — stage, guardrails, handoff, what was
persisted, and whether anything left the building.
"""
