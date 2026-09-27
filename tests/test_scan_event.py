"""Regression tests for the deterministic event parser."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.scan_event import keywords, snippet, to_iso  # noqa: E402


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
