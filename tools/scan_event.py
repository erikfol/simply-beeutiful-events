"""Scan an SBE event folder -> summary + timeline.
Usage: python tools/scan_event.py "events/6.6.26 Mistretta-Petran Wedding"
Outputs JSON + Markdown into doc-reader/reports/
Local-only, no AI calls.
"""
import re, json, sys
from pathlib import Path
from datetime import datetime
from collections import Counter

DATE_RES = [
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b",
    r"\b\d{1,2}/\d{1,2}/\d{2,4}\b",
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\b\d{1,2}\.\d{1,2}\.\d{2,4}\b",
]
AMOUNT_RE = r"\$\s?[\d,]+(?:\.\d{2})?"
TIME_RES = [
    r"\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b",
    r"(?<![\d:])\b\d{1,2}\s*(?:AM|PM|am|pm)\b",
]
RANGE_RE = r"(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\s*(am|pm)\b"
DAYPART_RE = r"(ceremony|prelude|cocktail hour|reception|cocktails|dinner|welcome dinner|welcome party|after party|pick\s?up|delivery|setup|set\s?up|bus|shuttle|photos?|first look|hair|makeup|venue access|check[\s-]?in|check[\s-]?out)\b"
STOP = set("the,a,an,and,or,of,to,in,on,for,with,at,by,from,as,is,are,was,were,be,been,it,its,this,that,these,those,we,you,they,he,she,our,your,their,will,shall,per,via,etc,into,up,out,about,after,before,between,during".split(","))

def extract_text(p: Path) -> str:
    s = p.suffix.lower()
    try:
        if s in (".txt", ".md"):
            return p.read_text(errors="ignore")
        if s == ".docx":
            import docx
            d = docx.Document(p)
            return "\n".join([para.text for para in d.paragraphs] + [" ".join([c.text for c in row.cells]) for t in d.tables for row in t.rows])
        if s == ".pdf":
            import pymupdf
            d = pymupdf.open(p)
            return "\n".join([page.get_text() for page in d[:10]])  # first 10 pages enough
        if s == ".xlsx":
            import openpyxl
            wb = openpyxl.load_workbook(p, data_only=True, read_only=True)
            out = [f"[sheet: {ws.title}]" for ws in wb.worksheets]
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    vals = [str(v).strip() for v in row if v not in (None, "")]
                    if vals:
                        out.append(" | ".join(vals))
                    if len(out) > 400:
                        break
            return "\n".join(out)
    except Exception as e:
        return f"[parse error: {e}]"
    return ""

def to_iso(raw: str):
    raw = raw.strip()
    try:
        m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw)
        if m:
            y = m.group(3) if len(m.group(3)) == 4 else "20" + m.group(3)
            return f"{y}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
        m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})", raw)
        if m:
            y = m.group(3) if len(m.group(3)) == 4 else "20" + m.group(3)
            # assume M.D.YY for this dataset (6.6.26 = 2026-06-06)
            return f"{y}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
        if re.match(r"\d{4}-\d{2}-\d{2}", raw):
            return raw
        d = datetime.strptime(raw.replace(",", ""), "%B %d %Y")
        return d.strftime("%Y-%m-%d")
    except Exception:
        try:
            d = datetime.fromisoformat(raw)
            return d.strftime("%Y-%m-%d")
        except Exception:
            return None

def to_time_24(raw: str):
    """Normalize '4pm', '4:30pm', '6:00 PM' -> '16:00'. Returns None if no am/pm clue."""
    s = raw.strip().lower().replace(".", "")
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", s)
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if not ap:
        return None  # bare '10AM to 12AM' style needs context; skip to avoid false positives
    if ap == "pm" and h != 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if not (0 <= h <= 23 and 0 <= mi <= 59):
        return None
    return f"{h:02d}:{mi:02d}"

def find_times(snippet: str):
    """Extract time mentions from a snippet, return sorted unique HH:MM list."""
    found = []
    for m in re.finditer(RANGE_RE, snippet, flags=re.I):
        for h in (m.group(1), m.group(2)):
            t = to_time_24(f"{h}{m.group(3)}")
            if t:
                found.append(t)
    for pat in TIME_RES:
        for m in re.findall(pat, snippet, flags=re.I):
            t = to_time_24(m if isinstance(m, str) else m[0])
            if t:
                found.append(t)
    return sorted(set(found))

def daypart(snippet: str):
    m = re.search(DAYPART_RE, snippet, flags=re.I)
    return m.group(1).lower() if m else ""

def snippet(text, needle, r=100):
    i = text.find(needle)
    if i < 0:
        return needle[:160]
    return ("…" + text[max(0,i-r):i+len(needle)+r].replace("\n"," ").strip() + "…")[:220]

def keywords(text, n=8):
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9'-]{2,}", text.lower())
    c = Counter(w for w in words if w not in STOP)
    return [w for w,_ in c.most_common(n)]

def parse_budget(event_dir: Path):
    """Extract totals from *Budget.xlsx Budget Calculator sheet."""
    try:
        import openpyxl
        cands = list(event_dir.glob("*Budget*.xlsx"))
        if not cands:
            return None
        wb = openpyxl.load_workbook(cands[0], data_only=True, read_only=True)
        ws = wb["Budget Calculator"] if "Budget Calculator" in wb.sheetnames else wb.active
        rows = [r for r in ws.iter_rows(values_only=True) if any(v not in (None, "") for v in r)]
        budget_total = None
        categories = []
        totals = {}
        for r in rows:
            vals = [(v) for v in r]
            label = str(vals[1] or "").strip() if len(vals) > 1 else ""
            if "Total Wedding Budget" in str(vals[1:]):
                for v in vals:
                    if isinstance(v, (int, float)) and v > 1000:
                        budget_total = float(v)
                        break
            if label == "Total Cost:":
                totals = {"actual": f(vals, 6), "paid": f(vals, 7), "due": f(vals, 8)}
            elif label and len(vals) > 8 and isinstance(vals[6], (int, float)):
                # category rows have Actual Cost numeric; skip sub-zero? keep all with label
                if label not in ("Total Wedding Budget:",):
                    categories.append({"category": label, "actual": f(vals, 6), "paid": f(vals, 7), "due": f(vals, 8)})
        # find Remaining Budget row
        remaining = None
        for r in rows:
            if "Remaining Budget" in str(r):
                for v in r:
                    if isinstance(v, (int, float)):
                        remaining = float(v)
        return {"file": cands[0].name, "budget_total": budget_total,
                "total_actual": totals.get("actual"), "total_paid": totals.get("paid"),
                "total_due": totals.get("due"), "remaining_budget": remaining,
                "categories": categories}
    except Exception as e:
        return {"error": str(e)}

def f(vals, i):
    try:
        v = vals[i]
        return float(v) if isinstance(v, (int, float)) else 0.0
    except Exception:
        return 0.0

def parse_vendors(event_dir: Path):
    """Vendor list from *Vendor Options.xlsx Booked sheet + contract filenames."""
    vendors = []
    try:
        import openpyxl
        cands = list(event_dir.glob("*Vendor Options*.xlsx"))
        if cands:
            wb = openpyxl.load_workbook(cands[0], data_only=True, read_only=True)
            ws = wb["Booked"] if "Booked" in wb.sheetnames else wb.active
            for r in list(ws.iter_rows(values_only=True))[1:]:  # skip header row
                if not r or not r[0]:
                    continue
                name = str(r[0]).strip()
                if not name:
                    continue
                def col(i):
                    try:
                        return str(r[i] or "")
                    except IndexError:
                        return ""
                vendors.append({"vendor": name, "location": col(1), "event": col(2),
                                "contact": col(4), "email": col(5), "cost": col(6)})
    except Exception as e:
        vendors.append({"vendor": f"[vendor parse error: {e}]", "location": "", "event": "", "contact": "", "email": "", "cost": ""})
    # also list contract files as evidence
    contracts = sorted([p.name for p in event_dir.rglob("*") if p.is_file() and any(k in p.name.lower() for k in ("contract", "agreement", "quote", "estimate", "receipt", "invoice"))])
    return {"booked": vendors, "contract_files": contracts[:40]}

def scan(event_dir: Path):
    files = [p for p in event_dir.rglob("*") if p.is_file()]
    docs = []
    for p in sorted(files):
        rel = p.relative_to(event_dir).as_posix()
        ext = p.suffix.lower()
        entry = {"file": rel, "ext": ext, "size": p.stat().st_size, "text_len": 0,
                 "dates": [], "amounts": [], "keywords": [], "summary": "", "events": []}
        if ext in (".txt", ".md", ".docx", ".pdf", ".xlsx"):
            txt = extract_text(p)
            entry["text_len"] = len(txt)
            dates = []
            for pat in DATE_RES:
                dates += re.findall(pat, txt, flags=re.I)
            dates = sorted(set(dates))
            amounts = sorted(set(re.findall(AMOUNT_RE, txt)))
            sents = re.split(r"(?<=[.!?])\s+", txt)
            summ = " ".join([s.strip() for s in sents if len(s.strip()) > 40][:3])[:700]
            evs = []
            for d in dates:
                iso = to_iso(d)
                if iso:
                    snip = snippet(txt, d)
                    times = find_times(snip)
                    evs.append({"date_raw": d, "date_iso": iso, "snippet": snip,
                                "source": rel, "times": times,
                                "time": times[0] if times else None,
                                "label": daypart(snip)})
            evs.sort(key=lambda e: (e["date_iso"], e.get("time") or ""))
            entry.update({"dates": dates[:30], "amounts": amounts[:30], "keywords": keywords(txt), "summary": summ, "events": evs})
        elif ext in (".png", ".jpg", ".jpeg", ".heic"):
            entry["summary"] = "[image - visual inspo/photo, not text-parsed]"
        else:
            entry["summary"] = "[skipped type]"
        docs.append(entry)
    return docs

def main():
    base = Path(sys.argv[1] if len(sys.argv) > 1 else "events/6.6.26 Mistretta-Petran Wedding")
    docs = scan(base)
    all_events = sorted([e for d in docs for e in d["events"]], key=lambda e: (e["date_iso"], e.get("time") or ""))
    total_amounts = sorted(set(a for d in docs for a in d["amounts"]))
    budget = parse_budget(base)
    vendors = parse_vendors(base)
    out = {"event": base.as_posix(), "generated": datetime.now().isoformat(timespec="seconds"),
           "num_files": len(docs), "num_text_parsed": sum(1 for d in docs if d["text_len"] > 0),
           "num_timeline_events": len(all_events), "all_amounts": total_amounts[:50],
           "budget": budget, "vendors": vendors,
           "timeline": all_events[:200], "files": docs}
    repdir = Path("doc-reader/reports"); repdir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", base.name.lower()).strip("-")
    (repdir / f"{slug}.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    md = [f"# {base.name} — auto report", f"_Generated {out['generated']}, local-only parse_",
          f"\nFiles: {out['num_files']} | text-parsed: {out['num_text_parsed']} | timeline events: {out['num_timeline_events']}"]
    if budget and budget.get("budget_total"):
        md += ["\n## Budget totals",
               f"- Planned budget: ${budget['budget_total']:,.2f}",
               f"- Actual cost: ${budget.get('total_actual') or 0:,.2f}",
               f"- Paid to date: ${budget.get('total_paid') or 0:,.2f}",
               f"- Remaining due: ${budget.get('total_due') or 0:,.2f}",
               f"- Remaining budget (neg = over): ${budget.get('remaining_budget') or 0:,.2f}",
               "\n### By category (actual / paid / due)"]
        for c in (budget.get("categories") or [])[:30]:
            md.append(f"- {c['category']}: ${c['actual']:,.2f} / ${c['paid']:,.2f} / ${c['due']:,.2f}")
    if vendors and vendors.get("booked"):
        md += ["\n## Vendor list (Booked sheet)"]
        for v in vendors["booked"]:
            md.append(f"- **{v.get('vendor','')}** ({v.get('event') or 'n/a'}, {v.get('location') or 'n/a'}) — {v.get('cost') or 'cost n/a'} — {v.get('contact') or ''} {v.get('email') or ''}".strip())
        md += ["\n### Contract/quote files in folder"]
        md += [f"- {c}" for c in vendors.get("contract_files", [])]
    md += ["\n## Timeline (sorted)"]
    for e in all_events[:100]:
        md.append(f"- **{e['date_iso']}** ({e['date_raw']}) — {e['snippet']} _[{e['source']}]_")
    md.append("\n## Amounts seen")
    md.append(", ".join(total_amounts[:50]) or "—")
    md.append("\n## Per-file summaries")
    for d in docs:
        md.append(f"\n### {d['file']} ({d['text_len']} chars)")
        if d["summary"]: md.append(d["summary"][:800])
        if d["dates"]: md.append(f"\nDates: {', '.join(d['dates'][:15])}")
        if d["amounts"]: md.append(f"Amounts: {', '.join(d['amounts'][:15])}")
        if d["keywords"]: md.append(f"Keywords: {', '.join(d['keywords'])}")
    (repdir / f"{slug}.md").write_text("\n".join(md), encoding="utf-8")
    print(f"wrote {repdir/slug}.json + .md | files={len(docs)} events={len(all_events)}")

if __name__ == "__main__":
    main()
