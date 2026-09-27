"""Regression tests for the deterministic event parser."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.scan_event import keywords, parse_budget, parse_vendors, scan, snippet, to_iso  # noqa: E402

DEMO = Path(__file__).resolve().parent / "demo_event" / "6.12.27 Harper-Bennett Wedding (Demo)"


def test_to_iso_supports_project_date_formats():
    assert to_iso("6.6.26") == "2026-06-06"
    assert to_iso("6/6/2026") == "2026-06-06"
    assert to_iso("June 6, 2026") == "2026-06-06"
    assert to_iso("2026-06-06") == "2026-06-06"


def test_to_iso_returns_none_for_unknown_input():
    assert to_iso("sometime next summer") is None


def test_keywords_excludes_common_stop_words():
    result = keywords("the venue venue catering catering catering and flowers")
    assert "the" not in result
    assert result[0] == "catering"


def test_snippet_includes_context_and_normalizes_newlines():
    result = snippet("before\nJune 6, 2026\nafter", "June 6, 2026", r=20)
    assert "June 6, 2026" in result
    assert "\n" not in result


def test_demo_event_budget_and_vendors():
    budget = parse_budget(DEMO)
    assert budget["budget_total"] == 45000
    assert budget["total_actual"] == 51860
    assert budget["total_due"] == 32340
    assert len(parse_vendors(DEMO)["booked"]) == 9


def test_demo_event_wedding_day_times():
    events = [e for d in scan(DEMO) for e in d["events"] if e["date_iso"] == "2027-06-12"]
    times = {e["time"] for e in events if e["label"] == "ceremony"}
    assert times == {"16:00", "16:30"}  # intentional venue-vs-band conflict for the demo
