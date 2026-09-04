"""Compare two implementations' observations of the same fixture."""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from .observation import COMPARED_FIELDS


def _render(value: object, width: int = 220) -> str:
    text = json.dumps(value, default=str, sort_keys=True)
    return text if len(text) <= width else text[: width - 1] + "…"


@dataclass
class FieldDiff:
    turn: int
    field_name: str
    left: object
    right: object

    def render(self, left_impl: str, right_impl: str) -> str:
        return (
            f"    turn {self.turn}  {self.field_name}\n"
            f"      {left_impl:>8}: {_render(self.left)}\n"
            f"      {right_impl:>8}: {_render(self.right)}"
        )


@dataclass
class FixtureDiff:
    fixture_id: str
    case: str
    diffs: list[FieldDiff] = field(default_factory=list)
    #: Set when the two runs did not even produce the same number of turns.
    structural: str | None = None

    @property
    def ok(self) -> bool:
        return not self.diffs and self.structural is None


def compare(
    fixture: dict, left: list[dict], right: list[dict]
) -> FixtureDiff:
    """Diff two runs on exactly `COMPARED_FIELDS`, turn by turn."""
    result = FixtureDiff(fixture_id=fixture["id"], case=fixture.get("case", "?"))

    if len(left) != len(right):
        result.structural = (
            f"turn count differs: {len(left)} vs {len(right)}"
        )
        return result

    for index, (left_turn, right_turn) in enumerate(zip(left, right)):
        for name in COMPARED_FIELDS:
            left_value = left_turn.get(name)
            right_value = right_turn.get(name)
            if left_value != right_value:
                result.diffs.append(
                    FieldDiff(turn=index, field_name=name, left=left_value, right=right_value)
                )
    return result


@dataclass
class Report:
    left_impl: str
    right_impl: str
    backend: str
    results: list[FixtureDiff] = field(default_factory=list)

    @property
    def failed(self) -> list[FixtureDiff]:
        return [r for r in self.results if not r.ok]

    @property
    def ok(self) -> bool:
        return not self.failed

    def render(self, verbose: bool = False) -> str:
        lines = [
            f"parity: {self.left_impl} vs {self.right_impl}  "
            f"[backend={self.backend}, fields={len(COMPARED_FIELDS)}]",
            "",
        ]
        by_case: dict[str, list[FixtureDiff]] = {}
        for result in self.results:
            by_case.setdefault(result.case, []).append(result)

        for case, results in sorted(by_case.items()):
            bad = [r for r in results if not r.ok]
            mark = "ok  " if not bad else "FAIL"
            lines.append(f"  [{mark}] {case:<28} {len(results) - len(bad)}/{len(results)}")
            if verbose:
                for result in results:
                    lines.append(f"         · {result.fixture_id}")

        if self.failed:
            lines += ["", "Divergences:", ""]
            for result in self.failed:
                lines.append(f"  {result.fixture_id} ({result.case})")
                if result.structural:
                    lines.append(f"    {result.structural}")
                for diff in result.diffs:
                    lines.append(diff.render(self.left_impl, self.right_impl))
                lines.append("")

        total = len(self.results)
        lines += [
            "",
            f"{total - len(self.failed)}/{total} fixtures identical"
            + ("" if self.ok else f" — {len(self.failed)} DIVERGED"),
        ]
        return "\n".join(lines)
