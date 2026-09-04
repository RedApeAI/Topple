"""CLI for the parity harness.

    python -m tests.parity run --impl legacy --impl graph
    python -m tests.parity run --impl legacy --impl graph --backend containers
    python -m tests.parity run --impl legacy --impl graph --case handoff_sentiment -v
    python -m tests.parity cases
    python -m tests.parity seed

Run from `apps/worker/orchestrator`.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from .backends import make_backend
from .differ import Report, compare
from .recorder import FIXTURE_DIR, cases, load_fixtures
from .replayer import IMPLS, replay


async def _run(args: argparse.Namespace) -> int:
    fixtures = load_fixtures(Path(args.fixtures), case=args.case)
    if not fixtures:
        print(f"no fixtures in {args.fixtures}" + (f" for case {args.case!r}" if args.case else ""))
        return 2

    reference, *others = args.impl
    backend = make_backend(args.backend)
    await backend.start()

    exit_code = 0
    try:
        for other in others:
            report = Report(left_impl=reference, right_impl=other, backend=backend.name)
            for fixture in fixtures:
                left = await replay(fixture, reference, backend)
                right = await replay(fixture, other, backend)
                report.results.append(compare(fixture, left, right))
            print(report.render(verbose=args.verbose))
            print()
            if not report.ok:
                exit_code = 1
    finally:
        await backend.stop()
    return exit_code


def _cases(args: argparse.Namespace) -> int:
    counts = cases(Path(args.fixtures))
    total = sum(counts.values())
    width = max((len(name) for name in counts), default=10)
    for name, count in counts.items():
        print(f"  {name:<{width}}  {count}")
    print(f"\n  {'total':<{width}}  {total}")
    return 0


def _seed(args: argparse.Namespace) -> int:
    from .seed import seed_all

    written = asyncio.run(seed_all(Path(args.fixtures)))
    print(f"wrote {len(written)} fixtures to {args.fixtures}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tests.parity")
    parser.add_argument(
        "--fixtures", default=str(FIXTURE_DIR), help="fixture directory"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="compare implementations on every fixture")
    run.add_argument(
        "--impl",
        action="append",
        required=True,
        choices=sorted(IMPLS),
        help="repeat at least twice; the first is the reference",
    )
    run.add_argument("--backend", default="memory", choices=["memory", "containers"])
    run.add_argument("--case", default=None, help="only fixtures of this case")
    run.add_argument("-v", "--verbose", action="store_true")
    run.set_defaults(handler=lambda a: asyncio.run(_run(a)))

    listing = sub.add_parser("cases", help="fixture counts per case")
    listing.set_defaults(handler=_cases)

    seed = sub.add_parser("seed", help="regenerate the checked-in fixtures")
    seed.set_defaults(handler=_seed)

    args = parser.parse_args(argv)
    if args.command == "run" and len(args.impl) < 2:
        parser.error("--impl must be given at least twice (e.g. --impl legacy --impl graph)")
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
