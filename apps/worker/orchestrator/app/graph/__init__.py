"""LangGraph state graphs for both agent planes.

Two top-level graphs, deliberately not nested:

- `turn_graph` — reacts to an inbound buyer message. The playbook YAML owns
  control flow and the LLM only produces data, so the graph is replayable as a
  pure function given recorded LLM outputs.
- `operator_graph` — reacts to a typed salesperson command. Here the model owns
  control flow; that is the whole point of the plane.

That difference in who owns control flow is the reason they are separate
graphs rather than one with a mode switch.
"""
